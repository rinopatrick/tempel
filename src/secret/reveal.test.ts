import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FragmentKey } from "./crypto";

vi.mock("./crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./crypto")>();
  return { ...actual, decryptSecret: vi.fn() };
});

import { decryptSecret } from "./crypto";
import { revealSecret } from "./reveal";

const decryptMock = vi.mocked(decryptSecret);
const KEY = "A".repeat(43) as FragmentKey;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("revealSecret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decryptMock.mockResolvedValue("db-prod-9f2k");
  });

  it("fetches the envelope exactly once and decrypts locally", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ciphertext: "Y2k=", iv: "aXY=" }, 200),
    );
    vi.stubGlobal("fetch", fetchMock);
    const secret = await revealSecret({ id: "abc_123", key: KEY });
    expect(secret).toBe("db-prod-9f2k");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/secrets/abc_123");
    expect(decryptMock).toHaveBeenCalledWith(
      { ciphertext: "Y2k=", iv: "aXY=" },
      KEY,
    );
  });

  it("rejects an invalid id without touching the network", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      revealSecret({ id: "bad!id", key: KEY }),
    ).rejects.toThrow(/link/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid fragment key without touching the network", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      revealSecret({ id: "abc_123", key: "short" }),
    ).rejects.toThrow(/link/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a burned error on a 410 envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "gone" }, 410)),
    );
    await expect(revealSecret({ id: "abc_123", key: KEY })).rejects.toThrow(
      /hangus/i,
    );
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("surfaces a server failure without decrypting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    await expect(revealSecret({ id: "abc_123", key: KEY })).rejects.toThrow();
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("surfaces a network failure without decrypting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(revealSecret({ id: "abc_123", key: KEY })).rejects.toThrow();
    expect(decryptMock).not.toHaveBeenCalled();
  });
});
