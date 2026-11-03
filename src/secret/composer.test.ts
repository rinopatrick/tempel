import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FragmentKey } from "./crypto";

vi.mock("./crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./crypto")>();
  return { ...actual, encryptSecret: vi.fn() };
});

import { encryptSecret } from "./crypto";
import { createShareLink } from "./composer";

const encryptMock = vi.mocked(encryptSecret);

function okResponse(id: string): Response {
  return new Response(JSON.stringify({ id }), {
    headers: { "content-type": "application/json" },
    status: 201,
  });
}

describe("createShareLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse("server-id-1")),
    );
  });

  it("encrypts in the browser and posts envelope-only", async () => {
    const key = "A".repeat(43) as FragmentKey;
    encryptMock.mockResolvedValue({
      envelope: { ciphertext: "Y2k=", iv: "aXY=" },
      key,
    });
    const link = await createShareLink({
      origin: "https://tempel.test",
      secret: "db-prod-9f2k",
      ttlSeconds: 3600,
    });
    expect(link).toBe(`https://tempel.test/s/server-id-1#${key}`);
    expect(encryptMock).toHaveBeenCalledWith("db-prod-9f2k");
    expect(fetch).toHaveBeenCalledWith(
      "https://tempel.test/api/secrets",
      expect.objectContaining({ method: "POST" }),
    );
    const sent = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1]?.body as string) ?? "{}",
    );
    expect(sent).toEqual({
      ciphertext: "Y2k=",
      iv: "aXY=",
      ttlSeconds: 3600,
    });
    expect(sent).not.toHaveProperty("key");
    expect(sent).not.toHaveProperty("plaintext");
  });

  it("rejects an empty secret without touching the network", async () => {
    await expect(
      createShareLink({
        origin: "https://tempel.test",
        secret: "   ",
        ttlSeconds: 3600,
      }),
    ).rejects.toThrow(/kosong/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces a server failure without a link", async () => {
    encryptMock.mockResolvedValue({
      envelope: { ciphertext: "Y2k=", iv: "aXY=" },
      key: "A".repeat(43) as FragmentKey,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    await expect(
      createShareLink({
        origin: "https://tempel.test",
        secret: "db-prod-9f2k",
        ttlSeconds: 3600,
      }),
    ).rejects.toThrow();
  });
});
