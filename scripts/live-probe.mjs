// Live probe: file-based bodies only, no inline quoting.
// Usage: node scripts/live-probe.mjs [baseUrl]
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

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} :: ${r.detail}`);
if (results.some((r) => !r.pass)) process.exit(1);
console.log("LIVE PROBE GREEN");
