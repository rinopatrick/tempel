import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetRateLimits } from "@/secret/rate-limit";

const storeMock = vi.fn();
const revealMock = vi.fn();
const statusMock = vi.fn();

vi.mock("@/secret/vault", () => ({
  getSharedVault: () => ({
    store: storeMock,
    reveal: revealMock,
    status: statusMock,
  }),
}));

import { POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/secrets", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/secrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });
  it("stores the envelope and returns a server-generated id", async () => {
    const res = await POST(jsonRequest({ ciphertext: "Y2k", iv: "aXY" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(body.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body).not.toHaveProperty("key");
    expect(storeMock).toHaveBeenCalledWith(
      body.id,
      {
        ciphertext: "Y2k",
        iv: "aXY",
      },
      undefined,
    );
  });

  it("rejects a key-bearing payload with 400 key-rejected", async () => {
    const res = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", key: "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key-rejected" });
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("rejects a plaintext-bearing payload with 400 key-rejected", async () => {
    const res = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", plaintext: "x" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key-rejected" });
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("rejects bad base64 with 400", async () => {
    const res = await POST(jsonRequest({ ciphertext: "!!!", iv: "aXY" }));
    expect(res.status).toBe(400);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("rejects standard base64 padding with 400", async () => {
    const res = await POST(jsonRequest({ ciphertext: "Y2k=", iv: "aXY=" }));
    expect(res.status).toBe(400);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range ttl with 400", async () => {
    const res = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", ttlSeconds: 999999 }),
    );
    expect(res.status).toBe(400);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("accepts an allowlisted ttl and stores the derived expiry", async () => {
    const before = Date.now();
    const res = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", ttlSeconds: 21_600 }),
    );
    expect(res.status).toBe(201);
    expect(storeMock).toHaveBeenCalledTimes(1);
    const expiresAt = storeMock.mock.calls[0][2] as number;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 21_600 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 21_600 * 1000);
  });

  it("returns 429 with Retry-After on POST flood without store touch", async () => {
    for (let i = 0; i < 10; i += 1) {
      await POST(jsonRequest({ ciphertext: "Y2k", iv: "aXY" }));
    }
    const res = await POST(jsonRequest({ ciphertext: "Y2k", iv: "aXY" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(await res.json()).toEqual({ error: "rate-limited" });
    expect(storeMock).toHaveBeenCalledTimes(10);
  });
});
