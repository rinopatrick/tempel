import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSecretVault, getSharedVault, resetSharedVault } from "./vault";
import { encryptSecret } from "./crypto";

describe("getSharedVault with an unavailable File Vault", () => {
  let dbDirectory: string;

  beforeEach(() => {
    dbDirectory = mkdtempSync(join(tmpdir(), "tempel-vault-"));
    vi.stubEnv("TEMPEL_DB_PATH", dbDirectory);
    vi.stubEnv("TEMPEL_STORE", undefined);
    resetSharedVault();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    resetSharedVault();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(dbDirectory, { recursive: true, force: true });
  });

  it("surfaces and logs a production init failure instead of returning a vault", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getSharedVault()).toThrow("File Vault unavailable");
    expect(() => getSharedVault()).toThrow("File Vault unavailable");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[tempel] file store unavailable",
      expect.any(Error),
    );
  });

  it.each([
    { nodeEnv: "development", store: undefined, logs: 1 },
    { nodeEnv: "production", store: "memory", logs: 0 },
  ])("allows a memory vault with NODE_ENV=$nodeEnv and TEMPEL_STORE=$store", ({
    nodeEnv,
    store,
    logs,
  }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("TEMPEL_STORE", store);
    const envelope = { ciphertext: "Y2k", iv: "aXY" };

    getSharedVault().store("id", envelope);

    expect(getSharedVault().reveal("id")).toEqual(envelope);
    expect(console.error).toHaveBeenCalledTimes(logs);
    resetSharedVault();
    expect(getSharedVault().status("id")).toBeNull();
  });
});

describe("createSecretVault", () => {
  it("reveals a stored envelope once, then refuses the second reveal", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope);
    const first = vault.reveal("id-1");
    expect(first).toEqual(sealed.envelope);
    expect(first).not.toBe(sealed.envelope);
    expect(vault.reveal("id-1")).toBeNull();
  });

  it("returns null for unknown ids", () => {
    const vault = createSecretVault();
    expect(vault.reveal("missing")).toBeNull();
  });

  it("reports created before reveal and burned after", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope);
    expect(vault.status("id-1")).toBe("created");
    vault.reveal("id-1");
    expect(vault.status("id-1")).toBe("burned");
  });

  it("reports a burned reason after reveal", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope);
    expect(vault.goneReason("id-1")).toBeNull();
    vault.reveal("id-1");
    expect(vault.goneReason("id-1")).toBe("burned");
  });

  it("reports an expired reason past the TTL", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope, Date.now() - 1000);
    expect(vault.goneReason("id-1")).toBe("expired");
  });

  it("reports an unknown reason for missing ids", () => {
    const vault = createSecretVault();
    expect(vault.goneReason("missing")).toBe("unknown");
  });

  it("reports null status for unknown ids", () => {
    const vault = createSecretVault();
    expect(vault.status("missing")).toBeNull();
  });

  it("burns an expired entry on reveal and reports expired", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope, Date.now() - 1000);
    expect(vault.reveal("id-1")).toBeNull();
    expect(vault.status("id-1")).toBe("expired");
    expect(vault.reveal("id-1")).toBeNull();
  });

  it("burns an expired entry on status check and reports expired", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope, Date.now() - 1000);
    expect(vault.status("id-1")).toBe("expired");
    expect(vault.goneReason("id-1")).toBe("expired");
    expect(vault.reveal("id-1")).toBeNull();
  });

  it("keeps a live entry created across status checks", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope, Date.now() + 60_000);
    expect(vault.status("id-1")).toBe("created");
    expect(vault.reveal("id-1")).toEqual(sealed.envelope);
  });
});
