import { describe, expect, it } from "vitest";
import type { FragmentKey } from "./crypto";
import { buildShareLink } from "./share-link";

const KEY_A = "A".repeat(43) as FragmentKey;
const KEY_MIXED = ("aB-_9".repeat(8) + "abc") as FragmentKey;

describe("buildShareLink", () => {
  it("renders an id path plus fragment key", () => {
    expect(
      buildShareLink({
        id: "abc_123-XYZ",
        key: KEY_A,
        origin: "https://tempel.test",
      }),
    ).toBe(`https://tempel.test/s/abc_123-XYZ#${KEY_A}`);
  });

  it("round-trips the link into id path plus fragment key", () => {
    const link = buildShareLink({
      id: "abc_123",
      key: KEY_MIXED,
      origin: "https://tempel.test",
    });
    const url = new URL(link);
    expect(url.pathname).toBe("/s/abc_123");
    expect(url.hash).toBe(`#${KEY_MIXED}`);
  });
});
