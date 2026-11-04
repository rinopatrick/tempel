import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encryptSecret } from "./crypto";
import { createFileVault } from "./vault";

function tmpDb(): string {
  return join(mkdtempSync(join(tmpdir(), "tempel-vault-")), "secrets.db");
}

describe("createFileVault (persistent store)", () => {
  it("survives a restart: store, reopen, reveal", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    const first = createFileVault(path);
    first.store("id-1", sealed.envelope, Date.now() + 60_000);
    // Simulate process restart: a fresh vault over the same file.
    const second = createFileVault(path);
    expect(second.status("id-1")).toBe("created");
    expect(second.reveal("id-1")).toEqual(sealed.envelope);
  });

  it("burns atomically: second reveal after reopen is refused", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() + 60_000);
    const reopened = createFileVault(path);
    expect(reopened.reveal("id-1")).toEqual(sealed.envelope);
    expect(createFileVault(path).reveal("id-1")).toBeNull();
    expect(createFileVault(path).goneReason("id-1")).toBe("burned");
  });

  it("expires across restart with an expired reason", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() - 1000);
    const reopened = createFileVault(path);
    expect(reopened.reveal("id-1")).toBeNull();
    expect(reopened.goneReason("id-1")).toBe("expired");
  });

  it("reports unknown for an id that was never stored", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() + 60_000);
    const vault = createFileVault(path);
    expect(vault.reveal("no-such-id")).toBeNull();
    expect(vault.goneReason("no-such-id")).toBe("unknown");
  });

  it("lets exactly one of two concurrent reveals claim the envelope", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() + 60_000);
    // Two handles over the same file, serialized only by the IMMEDIATE
    // transaction + conditional burn UPDATE. Sequential here because JS is
    // single-threaded; the worker-thread race below proves it across
    // threads. This pins the single-winner invariant at the vault seam.
    const first = createFileVault(path);
    const second = createFileVault(path);
    const results = await Promise.all([
      Promise.resolve().then(() => first.reveal("id-1")),
      Promise.resolve().then(() => second.reveal("id-1")),
    ]);
    const wins = results.filter((r) => r !== null);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toEqual(sealed.envelope);
    expect(createFileVault(path).goneReason("id-1")).toBe("burned");
  });

  it("lets exactly one racer win across worker threads on one file", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() + 60_000);
    const RACERS = 8;
    const gate = new SharedArrayBuffer(4);
    const flag = new Int32Array(gate);
    const workerSource = [
      "const { workerData } = require('node:worker_threads');",
      "const { DatabaseSync } = require('node:sqlite');",
      "const flag = new Int32Array(workerData.gate);",
      "Atomics.wait(flag, 0, 0);",
      "const db = new DatabaseSync(workerData.dbPath);",
      "db.exec('PRAGMA journal_mode = WAL');",
      "db.exec('PRAGMA busy_timeout = 10000');",
      "const row = db.prepare('SELECT ciphertext, iv FROM secrets WHERE id = ? AND state = ?').get(workerData.id, 'created');",
      "db.exec('BEGIN IMMEDIATE');",
      "let won = false;",
      "try {",
      "  const burned = db.prepare(\"UPDATE secrets SET ciphertext = '', iv = '', state = 'burned' WHERE id = ? AND state = 'created' AND expires_at > ?\").run(workerData.id, Date.now());",
      "  won = Number(burned.changes) === 1;",
      "  db.exec('COMMIT');",
      "} catch { db.exec('ROLLBACK'); }",
      "require('node:worker_threads').parentPort.postMessage(won && row ? 'WIN' : 'LOSE');",
    ].join("\n");
    const { Worker } = await import("node:worker_threads");
    const racers = Array.from({ length: RACERS }, () => {
      const worker = new Worker(workerSource, {
        eval: true,
        workerData: { dbPath: path, gate, id: "id-1" },
      });
      return new Promise<string>((resolve, reject) => {
        worker.once("message", (value: unknown) => {
          resolve(value as string);
          void worker.terminate();
        });
        worker.once("error", reject);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0, RACERS);
    const results = await Promise.all(racers);
    expect(results.filter((r) => r === "WIN")).toHaveLength(1);
    expect(results.filter((r) => r === "LOSE")).toHaveLength(RACERS - 1);
    expect(createFileVault(path).goneReason("id-1")).toBe("burned");
  });

  it("refuses the loser when the TTL lapses between read and burn", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() + 60_000);
    const vault = createFileVault(path);
    const realNow = Date.now;
    try {
      let calls = 0;
      // First call: pre-check sees a live row; second call (inside the
      // burn UPDATE): TTL has lapsed, so nothing flips and reveal is null.
      (Date as unknown as { now: () => number }).now = () => {
        calls += 1;
        return calls === 1 ? realNow() : realNow() + 120_000;
      };
      expect(vault.reveal("id-1")).toBeNull();
    } finally {
      (Date as unknown as { now: () => number }).now = realNow;
    }
    expect(vault.goneReason("id-1")).toBe("expired");
  });
});
