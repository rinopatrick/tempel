import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "./crypto";
import { createFileVault } from "./vault";

function tmpDb(): string {
  return join(mkdtempSync(join(tmpdir(), "tempel-vault-")), "secrets.db");
}

describe("createFileVault (cleanup on store)", () => {
  const envelope = { ciphertext: "Y2k", iv: "aXY" };
  const start = 1_000_000_000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  afterEach(() => vi.restoreAllMocks());

  it("clears a never-read row at expiry while preserving a live envelope", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    const path = tmpDb();
    const vault = createFileVault(path);
    vault.store("expiring", envelope, start + 1);
    vault.store("live", envelope, start + 2);

    clock.mockReturnValue(start + 1);
    vault.store("next", envelope);

    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const row = db.prepare("SELECT ciphertext, iv, state FROM secrets WHERE id = ?");
      expect(row.get("expiring")).toEqual({ ciphertext: "", iv: "", state: "expired" });
      expect(row.get("live")).toEqual({ ...envelope, state: "created" });
    } finally {
      db.close();
    }
    expect(vault.reveal("live")).toEqual(envelope);
  });

  it.each(["burned", "expired"] as const)("purges %s at the seven-day boundary", (reason) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start - 1);
    const vault = createFileVault(tmpDb());
    vault.store("original", envelope, reason === "expired" ? start : start + 3_600_000);
    clock.mockReturnValue(start);
    if (reason === "burned") expect(vault.reveal("original")).toEqual(envelope);

    clock.mockReturnValue(start + sevenDaysMs - 1);
    vault.store("within-window", envelope);
    expect(vault.goneReason("original")).toBe(reason);

    clock.mockReturnValue(start + sevenDaysMs);
    vault.store("after-window", envelope);
    expect(vault.goneReason("original")).toBe("unknown");
  });

  it("removes expired ciphertext from the SQLite file after cleanup and checkpoint", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    const path = tmpDb();
    const vault = createFileVault(path);
    const sentinel = "tempel-expiration-ciphertext-sentinel";
    vault.store("original", { ...envelope, ciphertext: sentinel.repeat(10) }, start + 1);
    vault.store("live", envelope);

    const db = new DatabaseSync(path);
    try {
      const checkpoint = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)");
      expect(checkpoint.get()?.busy).toBe(0);
      expect(readFileSync(path).includes(sentinel)).toBe(true);

      clock.mockReturnValue(start + 1);
      vault.store("next", envelope);
      expect(vault.goneReason("original")).toBe("expired");
      expect(checkpoint.get()?.busy).toBe(0);
      expect(readFileSync(path).includes(sentinel)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("opens the legacy schema and retains old burns based on their expiry", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + sevenDaysMs - 1);
    const path = tmpDb();
    const db = new DatabaseSync(path);
    try {
      db.exec(`
        CREATE TABLE secrets (
          id TEXT PRIMARY KEY,
          ciphertext TEXT NOT NULL,
          iv TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          state TEXT NOT NULL
        );
      `);
      db.prepare("INSERT INTO secrets VALUES ('legacy', '', '', ?, 'burned')").run(start);
    } finally {
      db.close();
    }

    const vault = createFileVault(path);
    vault.store("new", envelope);
    expect(vault.goneReason("legacy")).toBe("burned");
    expect(vault.reveal("new")).toEqual(envelope);

    clock.mockReturnValue(start + sevenDaysMs);
    const reopened = createFileVault(path);
    reopened.store("next", envelope);
    expect(reopened.goneReason("legacy")).toBe("unknown");
    expect(reopened.goneReason("new")).toBe("burned");
  });

  it("drains the expiry and purge backlogs across successive stores", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    const path = tmpDb();
    const vault = createFileVault(path);
    for (let i = 0; i < 101; i += 1) {
      vault.store(`burned-${i}`, envelope);
      vault.reveal(`burned-${i}`);
      vault.store(`expiring-${i}`, envelope, start + sevenDaysMs);
    }

    clock.mockReturnValue(start + sevenDaysMs);
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const count = db.prepare("SELECT count(*) AS rows FROM secrets WHERE id LIKE ? AND state = ?");
      vault.store("first", envelope);
      expect(count.get("expiring-%", "created")).toEqual({ rows: 1 });
      expect(count.get("burned-%", "burned")).toEqual({ rows: 1 });
      vault.store("second", envelope);
      expect(count.get("expiring-%", "created")).toEqual({ rows: 0 });
      expect(count.get("expiring-%", "expired")).toEqual({ rows: 101 });
      expect(count.get("burned-%", "burned")).toEqual({ rows: 0 });
    } finally {
      db.close();
    }
  });

  it.each(["UPDATE", "DELETE"] as const)("stores a live secret when cleanup %s fails", (operation) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(start - 1);
    const path = tmpDb();
    const vault = createFileVault(path);
    vault.store("stale", envelope, start);
    clock.mockReturnValue(start);
    if (operation === "DELETE") expect(vault.goneReason("stale")).toBe("expired");
    clock.mockReturnValue(start + sevenDaysMs);

    const db = new DatabaseSync(path);
    try {
      db.exec(`
        CREATE TRIGGER reject_cleanup BEFORE ${operation} ON secrets
        WHEN OLD.id = 'stale'
        BEGIN SELECT RAISE(ROLLBACK, 'cleanup failed'); END;
      `);
    } finally {
      db.close();
    }
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    vault.store("new", envelope);
    expect(vault.reveal("new")).toEqual(envelope);
    expect(logError).toHaveBeenCalledOnce();
  });
});

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

  it("burns an expired entry on status check and reports expired", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() - 1000);
    // Status first on a fresh handle: pins the status path itself
    // lazy-burns, before any reveal call.
    const reopened = createFileVault(path);
    expect(reopened.status("id-1")).toBe("expired");
    expect(reopened.goneReason("id-1")).toBe("expired");
    expect(reopened.reveal("id-1")).toBeNull();
  });

  it("expires across restart with an expired reason", async () => {
    const path = tmpDb();
    const sealed = await encryptSecret("db-prod-9f2k");
    createFileVault(path).store("id-1", sealed.envelope, Date.now() - 1000);
    const reopened = createFileVault(path);
    // Reveal first on a fresh handle: pins the reveal path itself burns
    // expired rows, since status() would also burn them via burnIfExpired.
    expect(reopened.reveal("id-1")).toBeNull();
    expect(reopened.status("id-1")).toBe("expired");
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
    // Racers drive the real reveal seam: each thread requires a bundle of
    // the vault module and calls createFileVault(dbPath).reveal(id). The
    // burn SQL lives only in vault.ts, so this test survives refactors of
    // the statements and transactions underneath.
    const dir = mkdtempSync(join(tmpdir(), "tempel-race-"));
    const bundle = join(dir, "vault.cjs");
    // esbuild refuses to run inside the jsdom test realm (its Uint8Array
    // invariant check fails there), so the bundle builds in a worker
    // thread, which runs real Node. One build, then N racers require it.
    const { Worker } = await import("node:worker_threads");
    const runWorker = <T>(source: string, workerData: object): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const worker = new Worker(source, { eval: true, workerData });
        worker.once("message", (value: unknown) => {
          resolve(value as T);
          void worker.terminate();
        });
        worker.once("error", reject);
      });
    await runWorker<string>(
      [
        "const { workerData, parentPort } = require('node:worker_threads');",
        "require('esbuild').buildSync({",
        "  entryPoints: [workerData.entry],",
        "  bundle: true,",
        "  platform: 'node',",
        "  format: 'cjs',",
        "  outfile: workerData.outfile,",
        "  external: ['node:sqlite'],",
        "  absWorkingDir: workerData.cwd,",
        "});",
        "parentPort.postMessage('built');",
      ].join("\n"),
      {
        entry: "src/secret/vault.ts",
        outfile: bundle,
        cwd: process.cwd(),
      },
    );
    const RACERS = 8;
    const gate = new SharedArrayBuffer(4);
    const flag = new Int32Array(gate);
    const workerSource = [
      "const { workerData, parentPort } = require('node:worker_threads');",
      "const flag = new Int32Array(workerData.gate);",
      "Atomics.wait(flag, 0, 0);",
      "const { createFileVault } = require(workerData.bundle);",
      "const got = createFileVault(workerData.dbPath).reveal(workerData.id);",
      "parentPort.postMessage(got === null ? 'LOSE' : 'WIN');",
    ].join("\n");
    const racers = Array.from({ length: RACERS }, () =>
      runWorker<string>(workerSource, {
        bundle,
        dbPath: path,
        gate,
        id: "id-1",
      }),
    );
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
