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

    resetSharedVault();
    const second = await GET(
      new Request(`http://localhost/api/secrets/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(second.status).toBe(410);
    expect(await second.json()).toEqual({ error: "gone", reason: "burned" });
  });

  it("returns 410 unknown for an id that was never stored", async () => {
    const id = "a".repeat(22);
    const res = await GET(new Request(`http://localhost/api/secrets/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "gone", reason: "unknown" });
  });

  it("returns 404 for a bad id without touching the store", async () => {
    const res = await GET(new Request("http://localhost/api/secrets/bad!id"), {
      params: Promise.resolve({ id: "bad!id" }),
    });
    expect(res.status).toBe(404);
  });
});
