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
    // single-threaded; true process-level proof lives in the route test
    // below (fresh vault per request, real HTTP concurrency via server).
    // This pins the single-winner invariant at the vault seam.
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
