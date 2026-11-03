import { describe, expect, it } from "vitest";
import { createSecretVault } from "./vault";
import { encryptSecret } from "./crypto";

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

  it("keeps a live entry viewable across status checks", async () => {
    const vault = createSecretVault();
    const sealed = await encryptSecret("db-prod-9f2k");
    vault.store("id-1", sealed.envelope, Date.now() + 60_000);
    expect(vault.status("id-1")).toBe("created");
    expect(vault.reveal("id-1")).toEqual(sealed.envelope);
  });
});
