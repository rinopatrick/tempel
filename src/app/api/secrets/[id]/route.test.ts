import { beforeEach, describe, expect, it, vi } from "vitest";

const revealMock = vi.fn();
const goneReasonMock = vi.fn();

vi.mock("@/secret/vault", () => ({
  getSharedVault: () => ({
    reveal: revealMock,
    goneReason: goneReasonMock,
  }),
}));

import { GET } from "./route";

function getRequest(id: string): Request {
  return new Request(`http://localhost/api/secrets/${id}`);
}

describe("GET /api/secrets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    goneReasonMock.mockReturnValue("burned");
  });

  it("returns the envelope on first reveal", async () => {
    const id = "a".repeat(22);
    revealMock.mockReturnValue({ ciphertext: "Y2k", iv: "aXY" });
    const res = await GET(getRequest(id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ciphertext: "Y2k", iv: "aXY" });
  });

  it("returns 410 with a burned reason on second reveal", async () => {
    const id = "a".repeat(22);
    revealMock.mockReturnValue(null);
    goneReasonMock.mockReturnValue("burned");
    const res = await GET(getRequest(id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "gone", reason: "burned" });
  });

  it("returns 404 for a bad id", async () => {
    const res = await GET(getRequest("bad!id"), {
      params: Promise.resolve({ id: "bad!id" }),
    });
    expect(res.status).toBe(404);
    expect(revealMock).not.toHaveBeenCalled();
    expect(goneReasonMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a well-formed but wrong-length id", async () => {
    const res = await GET(getRequest("abc_123"), {
      params: Promise.resolve({ id: "abc_123" }),
    });
    expect(res.status).toBe(404);
    expect(revealMock).not.toHaveBeenCalled();
    expect(goneReasonMock).not.toHaveBeenCalled();
  });

  it("returns 410 with an expired reason past the TTL", async () => {
    const id = "a".repeat(22);
    revealMock.mockReturnValue(null);
    goneReasonMock.mockReturnValue("expired");
    const res = await GET(getRequest(id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "gone", reason: "expired" });
  });
});
