import { beforeEach, describe, expect, it, vi } from "vitest";

const revealMock = vi.fn();

vi.mock("@/secret/vault", () => ({
  getSharedVault: () => ({
    reveal: revealMock,
  }),
}));

import { GET } from "./route";

function getRequest(id: string): Request {
  return new Request(`http://localhost/api/secrets/${id}`);
}

describe("GET /api/secrets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the envelope on first reveal", async () => {
    revealMock.mockReturnValue({ ciphertext: "Y2k=", iv: "aXY=" });
    const res = await GET(getRequest("abc_123"), {
      params: Promise.resolve({ id: "abc_123" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ciphertext: "Y2k=", iv: "aXY=" });
  });

  it("returns 410 on second reveal", async () => {
    revealMock.mockReturnValue(null);
    const res = await GET(getRequest("abc_123"), {
      params: Promise.resolve({ id: "abc_123" }),
    });
    expect(res.status).toBe(410);
  });

  it("returns 404 for a bad id", async () => {
    const res = await GET(getRequest("bad!id"), {
      params: Promise.resolve({ id: "bad!id" }),
    });
    expect(res.status).toBe(404);
    expect(revealMock).not.toHaveBeenCalled();
  });

  it("returns 410 for an unknown but well-formed id", async () => {
    revealMock.mockReturnValue(null);
    const res = await GET(getRequest("abc_123"), {
      params: Promise.resolve({ id: "abc_123" }),
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "gone" });
  });
});
