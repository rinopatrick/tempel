import { describe, expect, it } from "vitest";
import { createBurnStore } from "./burn-store";

describe("createBurnStore", () => {
  it("returns the ciphertext once, then refuses the second read", () => {
    const store = createBurnStore();
    store.put("id-1", "ciphertext-1");
    expect(store.take("id-1")).toBe("ciphertext-1");
    expect(store.take("id-1")).toBeNull();
  });

  it("returns null for unknown ids", () => {
    const store = createBurnStore();
    expect(store.take("missing")).toBeNull();
  });
});
