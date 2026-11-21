// Live probe: file-based bodies only, no inline quoting.
// Usage: TEMPEL_PROBE_SEED=1 node scripts/live-probe.mjs [baseUrl]
// The expired check needs POST /api/seed-expired, which answers 404
// unless the server runs with TEMPEL_PROBE_SEED=1.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:3111";
const dir = join(tmpdir(), "tempel-probe");
mkdirSync(dir, { recursive: true });
const bodyPath = join(dir, "body.json");
const keyPath = join(dir, "key.json");
writeFileSync(bodyPath, JSON.stringify({ ciphertext: "Y2k", iv: "aXY" }));
writeFileSync(keyPath, JSON.stringify({ ciphertext: "Y2k", iv: "aXY", key: "k" }));
const body = readFileSync(bodyPath, "utf8");
const keyBody = readFileSync(keyPath, "utf8");

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: Boolean(cond), detail });
}

const health = await fetch(`${base}/api/health`);
const healthJson = await health.json().catch(() => ({}));
check(
  "health 200 ok",
  health.status === 200 && healthJson.status === "ok",
  `status=${health.status} body=${JSON.stringify(healthJson)}`,
);

const created = await fetch(`${base}/api/secrets`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});
const createdJson = await created.json().catch(() => ({}));
check("POST 201", created.status === 201, `status=${created.status} id=${createdJson.id}`);
const id = createdJson.id;

const first = await fetch(`${base}/api/secrets/${id}`);
const firstJson = await first.json().catch(() => ({}));
check(
  "reveal 200 envelope",
  first.status === 200 && firstJson.ciphertext === "Y2k" && firstJson.iv === "aXY",
  `status=${first.status} body=${JSON.stringify(firstJson)}`,
);

const second = await fetch(`${base}/api/secrets/${id}`);
const secondJson = await second.json().catch(() => ({}));
check(
  "reveal 410 burned",
  second.status === 410 && secondJson.reason === "burned",
  `status=${second.status} body=${JSON.stringify(secondJson)}`,
);

const unknownId = "a".repeat(22);
const unknown = await fetch(`${base}/api/secrets/${unknownId}`);
const unknownJson = await unknown.json().catch(() => ({}));
check(
  "410 unknown",
  unknown.status === 410 && unknownJson.reason === "unknown",
  `status=${unknown.status} body=${JSON.stringify(unknownJson)}`,
);

const bad = await fetch(`${base}/api/secrets/bad___id`);
check("404 bad id", bad.status === 404, `status=${bad.status}`);

const keyRejected = await fetch(`${base}/api/secrets`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: keyBody,
});
const keyJson = await keyRejected.json().catch(() => ({}));
check(
  "400 key-rejected",
  keyRejected.status === 400 && keyJson.error === "key-rejected",
  `status=${keyRejected.status} body=${JSON.stringify(keyJson)}`,
);

// Expired: shortest allowlisted TTL then reveal with the clock past it is
// not observable live, so seed a past-expiry row directly in the file
// store and prove reveal reports 410 expired (TTL path, not Burned).
const ID_LEN = 22;
const expiredId = "e".repeat(ID_LEN);
const seed = await fetch(`${base}/api/seed-expired`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: expiredId }),
});
if (seed.status === 404) {
  check("410 expired", false, "seed route missing: expected POST /api/seed-expired");
} else {
  const expired = await fetch(`${base}/api/secrets/${expiredId}`);
  const expiredJson = await expired.json().catch(() => ({}));
  check(
    "410 expired",
    expired.status === 410 && expiredJson.reason === "expired",
    `status=${expired.status} body=${JSON.stringify(expiredJson)}`,
  );
}

// Flood: fresh test IP so the earlier probe POSTs stay out of budget.
// POST budget is 10 per minute: 10 warmups fill it, the 11th must 429.
const POST_BUDGET = 10;
const floodIp = "203.0.113.99";
let floodRes = null;
for (let i = 0; i <= POST_BUDGET; i += 1) {
  floodRes = await fetch(`${base}/api/secrets`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": floodIp },
    body,
  });
  await floodRes.text().catch(() => "");
}
check(
  "429 flood with Retry-After",
  floodRes !== null &&
    floodRes.status === 429 &&
    floodRes.headers.get("retry-after") !== null,
  `status=${floodRes?.status} retry-after=${floodRes?.headers.get("retry-after")}`,
);

// Security headers (#70): every page and API route, never X-Powered-By.
// Exact production CSP values, so a dev build ('unsafe-eval') or a widened
// source list fails the probe.
const EXPECTED_CSP = {
  "default-src": "'self'",
  "script-src": "'self' 'unsafe-inline'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob:",
  "font-src": "'self'",
  "connect-src": "'self'",
  "frame-ancestors": "'none'",
  "base-uri": "'none'",
  "form-action": "'self'",
  "object-src": "'none'",
};
function parseCsp(header) {
  const directives = {};
  for (const part of header.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives[name] = sources.join(" ");
  }
  return directives;
}
for (const path of ["/", `/s/${"h".repeat(ID_LEN)}`, "/api/health"]) {
  const res = await fetch(`${base}${path}`);
  await res.text().catch(() => "");
  const h = res.headers;
  const csp = parseCsp(h.get("content-security-policy") ?? "");
  const wrong = Object.keys({ ...EXPECTED_CSP, ...csp }).filter(
    (d) => csp[d] !== EXPECTED_CSP[d],
  );
  check(
    `security headers ${path}`,
    wrong.length === 0 &&
      h.get("x-frame-options") === "DENY" &&
      h.get("x-content-type-options") === "nosniff" &&
      h.get("referrer-policy") === "no-referrer" &&
      !h.has("x-powered-by"),
    `csp-wrong=${JSON.stringify(wrong.map((d) => `${d}: ${csp[d] ?? "(missing)"}`))} xfo=${h.get("x-frame-options")} xcto=${h.get("x-content-type-options")} referrer=${h.get("referrer-policy")} powered-by=${h.get("x-powered-by")}`,
  );
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} :: ${r.detail}`);
if (results.some((r) => !r.pass)) process.exit(1);
console.log("LIVE PROBE GREEN");
