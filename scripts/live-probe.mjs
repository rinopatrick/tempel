// Isolated instance with the seed route enabled: node scripts/live-probe.mjs [baseUrl]
// HTTPS staging edge with the seed route disabled: node scripts/live-probe.mjs https://host --edge
const [target = "http://localhost:3111", mode, ...extra] = process.argv.slice(2);
if ((mode !== undefined && mode !== "--edge") || extra.length > 0) {
  throw new Error("Usage: node scripts/live-probe.mjs [baseUrl] [--edge]");
}

const base = new URL(target);
const edge = mode === "--edge";
if (edge && base.protocol !== "https:") {
  throw new Error("The edge probe requires an HTTPS URL.");
}

function request(path, init) {
  return fetch(new URL(path, base), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

const body = JSON.stringify({ ciphertext: "Y2k", iv: "aXY" });
const keyBody = JSON.stringify({ ciphertext: "Y2k", iv: "aXY", key: "k" });

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: Boolean(cond), detail });
}

const health = await request("/api/health");
const healthJson = await health.json().catch(() => ({}));
if (health.status !== 200 || healthJson.status !== "ok" || healthJson.store !== "file") {
  throw new Error(`Expected a healthy File Vault, got ${health.status} ${JSON.stringify(healthJson)}`);
}
check("health 200 ok file", true, `body=${JSON.stringify(healthJson)}`);

if (edge) {
  const seed = await request("/api/seed-expired", { method: "POST" });
  const seedJson = await seed.json().catch(() => ({}));
  if (seed.status !== 404 || seedJson.error !== "unknown") {
    throw new Error(`Expected the seed route to be disabled, got ${seed.status}`);
  }
  check("404 seed disabled", true, `status=${seed.status}`);
}

const created = await request("/api/secrets", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});
const createdJson = await created.json().catch(() => ({}));
const id = createdJson?.id;
if (created.status !== 201 || typeof id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(id)) {
  throw new Error(`Expected a new secret ID, got ${created.status}`);
}
check("POST 201", true, `status=${created.status} id=${id}`);

const head = await request(`/api/secrets/${id}`, { method: "HEAD" });
check(
  "HEAD 405 Allow GET empty body",
  head.status === 405 && head.headers.get("allow") === "GET" && (await head.text()) === "",
  `status=${head.status} allow=${head.headers.get("allow")}`,
);

const first = await request(`/api/secrets/${id}`);
const firstJson = await first.json().catch(() => ({}));
check(
  "reveal 200 envelope",
  first.status === 200 && firstJson.ciphertext === "Y2k" && firstJson.iv === "aXY",
  `status=${first.status} body=${JSON.stringify(firstJson)}`,
);
const firstCacheControl = first.headers.get("cache-control");
check("reveal 200 no-store", firstCacheControl === "no-store", `cache-control=${firstCacheControl}`);

const second = await request(`/api/secrets/${id}`);
const secondJson = await second.json().catch(() => ({}));
check(
  "reveal 410 burned",
  second.status === 410 && secondJson.reason === "burned",
  `status=${second.status} body=${JSON.stringify(secondJson)}`,
);
const secondCacheControl = second.headers.get("cache-control");
check("reveal 410 no-store", secondCacheControl === "no-store", `cache-control=${secondCacheControl}`);

const unknownId = "a".repeat(22);
const unknown = await request(`/api/secrets/${unknownId}`);
const unknownJson = await unknown.json().catch(() => ({}));
check(
  "404 unknown",
  unknown.status === 404 && unknownJson.error === "unknown",
  `status=${unknown.status} body=${JSON.stringify(unknownJson)}`,
);

const bad = await request("/api/secrets/bad___id");
check("404 bad id", bad.status === 404, `status=${bad.status}`);

const keyRejected = await request("/api/secrets", {
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

const ID_LEN = 22;
if (!edge) {
  // Seed a past-expiry row on the isolated instance to verify the TTL path.
  const expiredId = "e".repeat(ID_LEN);
  const seed = await request("/api/seed-expired", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: expiredId }),
  });
  if (seed.status !== 201) {
    throw new Error(`Expected the isolated seed route to return 201, got ${seed.status}`);
  }

  const expired = await request(`/api/secrets/${expiredId}`);
  const expiredJson = await expired.json().catch(() => ({}));
  check(
    "410 expired",
    expired.status === 410 && expiredJson.reason === "expired",
    `status=${expired.status} body=${JSON.stringify(expiredJson)}`,
  );

  // Give the isolated rate-limit check its own fixture IP budget.
  const postBudget = 10;
  let limited;
  for (let i = 0; i <= postBudget; i += 1) {
    limited = await request("/api/secrets", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" },
      body,
    });
    await limited.text();
  }
  const retryAfter = limited.headers.get("retry-after");
  check("429 with Retry-After", limited.status === 429 && retryAfter !== null,
    `status=${limited.status} retry-after=${retryAfter}`);
}

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
  const res = await request(path);
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
console.log(edge ? "EDGE PROBE GREEN" : "LIVE PROBE GREEN");
