import { NextResponse } from "next/server";
import { getSharedVault } from "@/secret/vault";

const TTL_ALLOWLIST = [3_600, 21_600, 86_400];

function base64Field(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 100_000) {
    return false;
  }
  if (value.length % 4 !== 0) return false;
  try {
    atob(value);
    return /^[A-Za-z0-9+/]*={0,2}$/.test(value);
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
  if (!base64Field(ciphertext) || !base64Field(iv)) {
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
