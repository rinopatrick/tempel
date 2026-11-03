import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("secret crypto", () => {
  it("roundtrips plaintext through encrypt and decrypt", async () => {
    const sealed = await encryptSecret("db-prod-9f2k");
    await expect(decryptSecret(sealed)).resolves.toBe("db-prod-9f2k");
  });

  it("fails to decrypt with the wrong key", async () => {
    const { ciphertext, iv } = await encryptSecret("db-prod-9f2k");
    const { key: wrongKey } = await encryptSecret("other");
    await expect(decryptSecret({ ciphertext, iv, key: wrongKey })).rejects.toThrow();
  });
});
