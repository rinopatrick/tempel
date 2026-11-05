import { describe, expect, it, beforeEach } from "vitest";
import {
  RATE_LIMIT_GET_PER_MINUTE,
  RATE_LIMIT_POST_PER_MINUTE,
  checkRateLimit,
  clientIp,
  resetRateLimits,
} from "./rate-limit";

describe("rate limit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows POST inside the budget", () => {
    for (let i = 0; i < RATE_LIMIT_POST_PER_MINUTE; i += 1) {
      expect(checkRateLimit("1.1.1.1", "post-secret").allowed).toBe(true);
    }
  });

  it("rejects the 11th POST with a retry hint", () => {
    for (let i = 0; i < RATE_LIMIT_POST_PER_MINUTE; i += 1) {
      checkRateLimit("1.1.1.1", "post-secret");
    }
    const limited = checkRateLimit("1.1.1.1", "post-secret");
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rejects the 61st GET with a retry hint", () => {
    for (let i = 0; i < RATE_LIMIT_GET_PER_MINUTE; i += 1) {
      checkRateLimit("2.2.2.2", "get-secret");
    }
    const limited = checkRateLimit("2.2.2.2", "get-secret");
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("scopes buckets per IP and per endpoint", () => {
    for (let i = 0; i < RATE_LIMIT_POST_PER_MINUTE; i += 1) {
      checkRateLimit("3.3.3.3", "post-secret");
    }
    expect(checkRateLimit("3.3.3.3", "post-secret").allowed).toBe(false);
    expect(checkRateLimit("4.4.4.4", "post-secret").allowed).toBe(true);
    expect(checkRateLimit("3.3.3.3", "get-secret").allowed).toBe(true);
  });

  it("prefers the first forwarded address", () => {
    const req = new Request("http://localhost/api/secrets", {
      headers: { "x-forwarded-for": "5.5.5.5, 6.6.6.6" },
    });
    expect(clientIp(req)).toBe("5.5.5.5");
  });
});
