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
