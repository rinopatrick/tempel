import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/secret/rate-limit";
import { getSharedVault } from "@/secret/vault";

const TTL_ALLOWLIST = [3_600, 21_600, 86_400];

function base64UrlField(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 100_000) {
    return false;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding === 1) return false;
  if (padding > 0) base64 += "=".repeat(4 - padding);
  try {
    atob(base64);
    return true;
  } catch {
    return false;
  }
}

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function POST(request: Request) {
  const limited = checkRateLimit(clientIp(request), "post-secret");
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "rate-limited" },
      {
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
        status: 429,
      },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-envelope" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "bad-envelope" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if ("key" in record || "plaintext" in record) {
    return NextResponse.json({ error: "key-rejected" }, { status: 400 });
  }
  const { ciphertext, iv, ttlSeconds } = record;
  if (!base64UrlField(ciphertext) || !base64UrlField(iv)) {
    return NextResponse.json({ error: "bad-envelope" }, { status: 400 });
  }
  let expiresAt: number | undefined;
  if (ttlSeconds !== undefined) {
    if (
      typeof ttlSeconds !== "number" ||
      !Number.isInteger(ttlSeconds) ||
      !TTL_ALLOWLIST.includes(ttlSeconds)
    ) {
      return NextResponse.json({ error: "bad-ttl" }, { status: 400 });
    }
    expiresAt = Date.now() + ttlSeconds * 1000;
  }
  const id = newId();
  getSharedVault().store(
    id,
    { ciphertext: ciphertext as string, iv: iv as string },
    expiresAt,
  );
  return NextResponse.json({ id }, { status: 201 });
}
