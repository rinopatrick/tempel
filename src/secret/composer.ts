import { encryptSecret } from "./crypto";
import { buildShareLink } from "./share-link";

export const TTL_OPTIONS = [
  { label: "1 jam", seconds: 3600 },
  { label: "6 jam", seconds: 21600 },
  { label: "24 jam", seconds: 86400 },
] as const;

export interface CreateShareLinkInput {
  origin: string;
  secret: string;
  ttlSeconds: number;
}

export async function createShareLink({
  origin,
  secret,
  ttlSeconds,
}: CreateShareLinkInput): Promise<string> {
  if (secret.trim().length === 0) {
    throw new Error("Secret tidak boleh kosong.");
  }
  const sealed = await encryptSecret(secret);
  const res = await fetch(`${origin}/api/secrets`, {
    body: JSON.stringify({
      ciphertext: sealed.envelope.ciphertext,
      iv: sealed.envelope.iv,
      ttlSeconds,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Gagal membuat link (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("Respons server tidak valid.");
  }
  return buildShareLink({ id: body.id, key: sealed.key, origin });
}
