import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/secrets/route";
import { GET } from "@/app/api/secrets/[id]/route";
import { resetSharedVault } from "@/secret/vault";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/secrets", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("routes against the persistent store", () => {
  beforeEach(() => {
    process.env.TEMPEL_DB_PATH = join(
      mkdtempSync(join(tmpdir(), "tempel-route-")),
      "secrets.db",
    );
    delete process.env.TEMPEL_STORE;
    resetSharedVault();
  });

  it("POST 201 then reveal 200 then 410 burned across shared instances", async () => {
    const created = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", ttlSeconds: 3_600 }),
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    // Simulate restart: drop the cached vault, same file underneath.
    resetSharedVault();
    const first = await GET(new Request(`http://localhost/api/secrets/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ciphertext: "Y2k", iv: "aXY" });

    resetSharedVault();
    const second = await GET(
      new Request(`http://localhost/api/secrets/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(second.status).toBe(410);
    expect(await second.json()).toEqual({ error: "gone", reason: "burned" });
  });

  it("burns an expired entry on reveal against the persistent store", async () => {
    const realNow = Date.now;
    try {
      // POST at T0 with the shortest allowlisted TTL, then advance past
      // it: proves the POST-computed expires_at actually lapses.
      (Date as unknown as { now: () => number }).now = () => realNow();
      const created = await POST(
        jsonRequest({ ciphertext: "Y2k", iv: "aXY", ttlSeconds: 3_600 }),
      );
      expect(created.status).toBe(201);
      const { id } = (await created.json()) as { id: string };
      (Date as unknown as { now: () => number }).now =
        () => realNow() + 3_601 * 1000;

      resetSharedVault();
      const res = await GET(
        new Request(`http://localhost/api/secrets/${id}`),
        { params: Promise.resolve({ id }) },
      );
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ error: "gone", reason: "expired" });
    } finally {
      (Date as unknown as { now: () => number }).now = realNow;
      resetSharedVault();
    }
  });

  it("returns 410 unknown for an id that was never stored", async () => {
    const id = "a".repeat(22);
    const res = await GET(new Request(`http://localhost/api/secrets/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "gone", reason: "unknown" });
  });

  it("wins once end to end: first reveal 200, second 410 burned, unknown 410", async () => {
    const created = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", ttlSeconds: 3_600 }),
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const first = await GET(new Request(`http://localhost/api/secrets/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ciphertext: "Y2k", iv: "aXY" });

    const second = await GET(
      new Request(`http://localhost/api/secrets/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(second.status).toBe(410);
    expect(await second.json()).toEqual({ error: "gone", reason: "burned" });

    const foreign = `f${"o".repeat(21)}`;
    const unknown = await GET(
      new Request(`http://localhost/api/secrets/${foreign}`),
      { params: Promise.resolve({ id: foreign }) },
    );
    expect(unknown.status).toBe(410);
    expect(await unknown.json()).toEqual({
      error: "gone",
      reason: "unknown",
    });
  });

  it("returns 404 for a bad id without touching the store", async () => {
    const res = await GET(new Request("http://localhost/api/secrets/bad!id"), {
      params: Promise.resolve({ id: "bad!id" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a key-bearing envelope with 400 key-rejected", async () => {
    const res = await POST(
      jsonRequest({ ciphertext: "Y2k", iv: "aXY", key: "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "key-rejected" });
  });
});
