import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseFragmentKey } from "./crypto";

describe("secret crypto", () => {
  it("roundtrips plaintext through encrypt and decrypt", async () => {
    const sealed = await encryptSecret("db-prod-9f2k");
    await expect(decryptSecret(sealed.envelope, sealed.key)).resolves.toBe(
      "db-prod-9f2k",
    );
  });

  it("fails to decrypt with the wrong key", async () => {
    const sealed = await encryptSecret("db-prod-9f2k");
    const other = await encryptSecret("other");
    await expect(decryptSecret(sealed.envelope, other.key)).rejects.toThrow();
  });

  it("keeps the key out of the stored envelope", async () => {
    const sealed = await encryptSecret("db-prod-9f2k");
    expect(sealed.envelope).not.toHaveProperty("key");
  });

  it("accepts a 43-char url-safe key and rejects the rest", () => {
    expect(parseFragmentKey("A".repeat(43))).not.toBeNull();
    expect(parseFragmentKey("aB-_9".repeat(8) + "abc")).not.toBeNull();
    expect(parseFragmentKey("short")).toBeNull();
    expect(parseFragmentKey("A".repeat(43) + "!")).toBeNull();
  });
});
