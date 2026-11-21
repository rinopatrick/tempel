// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSharedVault } from "@/secret/vault";
import { GET } from "./route";

describe("GET /api/health", () => {
  let dbDirectory: string;

  beforeEach(() => {
    dbDirectory = mkdtempSync(join(tmpdir(), "tempel-health-"));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEMPEL_STORE", undefined);
    vi.stubEnv("TEMPEL_DB_PATH", join(dbDirectory, "secrets.db"));
    resetSharedVault();
  });

  afterEach(() => {
    resetSharedVault();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(dbDirectory, { recursive: true, force: true });
  });

  it("reports a working File Vault", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", store: "file" });
  });

  it("reports the explicit memory store in production", async () => {
    vi.stubEnv("TEMPEL_STORE", "memory");
    vi.stubEnv("TEMPEL_DB_PATH", dbDirectory);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", store: "memory" });
  });

  it("reports the actual memory store after a development fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEMPEL_DB_PATH", dbDirectory);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", store: "memory" });
  });

  it("returns 503 for an unavailable production File Vault before any secret request", async () => {
    vi.stubEnv("TEMPEL_DB_PATH", dbDirectory);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable", store: "file" });
  });
});
