import { decryptSecret, parseFragmentKey, type FragmentKey, type StoredEnvelope } from "./crypto";

export interface RevealSecretInput {
  id: string;
  key: string;
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export async function revealSecret({ id, key }: RevealSecretInput): Promise<string> {
  const fragmentKey = parseFragmentKey(key);
  if (!validId(id) || fragmentKey === null) {
    throw new Error("Link tidak valid.");
  }
  let res: Response;
  try {
    res = await fetch(`/api/secrets/${id}`);
  } catch {
    throw new Error("Gagal membuka link. Coba lagi.");
  }
  if (res.status === 410) {
    throw new Error("Link hangus.");
  }
  if (!res.ok) {
    throw new Error(`Gagal membuka link (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as Partial<StoredEnvelope>;
  if (typeof body.ciphertext !== "string" || typeof body.iv !== "string") {
    throw new Error("Respons server tidak valid.");
  }
  return decryptSecret(
    { ciphertext: body.ciphertext, iv: body.iv },
    fragmentKey as FragmentKey,
  );
}
