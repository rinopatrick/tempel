import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

// Next matches header sources with this compiled path-to-regexp.
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as { pathToRegexp: (source: string) => RegExp };

const REVEAL_PATH = `/s/${"a".repeat(22)}`;
const ROUTES = ["/", REVEAL_PATH, "/api/secrets", "/api/health"];

const BASE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
];

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!pathToRegexp(rule.source).test(path)) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

function directives(csp: string): Map<string, string> {
  return new Map(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.split(/\s+/)[0], d] as const),
  );
}

describe("security headers (#70)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drops the X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it.each(ROUTES)("sends the hardening headers on %s", async (path) => {
    const headers = await headersFor(path);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["content-security-policy"]).toBeDefined();
  });

  it.each(ROUTES)("sends the production CSP on %s", async (path) => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = (await headersFor(path))["content-security-policy"] ?? "";
    const got = directives(csp);
    for (const want of BASE_CSP) {
      expect(got.get(want.split(" ")[0])).toBe(want);
    }
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows eval only outside production for the dev runtime", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const csp = (await headersFor("/"))["content-security-policy"] ?? "";
    expect(directives(csp).get("script-src")).toBe(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
    expect(directives(csp).get("frame-ancestors")).toBe(
      "frame-ancestors 'none'",
    );
  });
});
