import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/secret/rate-limit";

const revealMock = vi.fn();
const goneReasonMock = vi.fn();

vi.mock("@/secret/vault", () => ({
  getSharedVault: () => ({
    reveal: revealMock,
    goneReason: goneReasonMock,
  }),
}));

import { GET } from "./route";
import * as route from "./route";

function headRequest(id: string) {
  const handler = (route as {
    HEAD?: (...args: Parameters<typeof GET>) => Promise<Response>;
  }).HEAD ?? GET;
  return handler(new Request(`http://localhost/api/secrets/${id}`, { method: "HEAD" }), {
    params: Promise.resolve({ id }),
  });
}

function getRequest(id: string): Request {
  return new Request(`http://localhost/api/secrets/${id}`);
}

describe("GET /api/secrets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    goneReasonMock.mockReturnValue("burned");
  });

  it("rejects HEAD without consuming the first reveal", async () => {
    const id = "a".repeat(22);
    const envelope = { ciphertext: "Y2k", iv: "aXY" };
    revealMock.mockReturnValueOnce(envelope).mockReturnValue(null);

    const head = await headRequest(id);
    expect.soft(head.status).toBe(405);
    expect.soft(head.headers.get("Allow")).toBe("GET");
    expect.soft(await head.text()).toBe("");
    expect.soft(revealMock).not.toHaveBeenCalled();
    expect.soft(goneReasonMock).not.toHaveBeenCalled();

    const res = await GET(getRequest(id), { params: Promise.resolve({ id }) });
    expect.soft(res.status).toBe(200);
    expect.soft(await res.json()).toEqual(envelope);
  });

  it.each(["unknown", "burned", "expired", "malformed"])(
    "rejects HEAD for a %s id without touching the vault",
    async (reason) => {
      const id = reason === "malformed" ? "bad!id" : "a".repeat(22);
      revealMock.mockReturnValue(null);
      goneReasonMock.mockReturnValue(reason);

      const res = await headRequest(id);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET");
      expect(await res.text()).toBe("");
      expect(revealMock).not.toHaveBeenCalled();
      expect(goneReasonMock).not.toHaveBeenCalled();
    },
  );

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

  it("returns 429 with Retry-After on GET flood without vault touch", async () => {
    const id = "a".repeat(22);
    revealMock.mockReturnValue({ ciphertext: "Y2k", iv: "aXY" });
    for (let i = 0; i < 60; i += 1) {
      await GET(getRequest(id), { params: Promise.resolve({ id }) });
    }
    const res = await GET(getRequest(id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(await res.json()).toEqual({ error: "rate-limited" });
    expect(revealMock).toHaveBeenCalledTimes(60);
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
