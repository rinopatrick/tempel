import { decryptSecret, parseFragmentKey, type FragmentKey, type StoredEnvelope } from "./crypto";

export interface RevealSecretInput {
  id: string;
  key: string;
}

export class RevealNetworkError extends Error {
  constructor(message = "Gagal membuka link. Coba lagi.") {
    super(message);
    this.name = "RevealNetworkError";
  }
}

export class RevealBurnedError extends Error {
  constructor(message = "Link sudah hangus karena pernah dibuka.") {
    super(message);
    this.name = "RevealBurnedError";
  }
}

export class RevealExpiredError extends Error {
  constructor(message = "Link kedaluwarsa.") {
    super(message);
    this.name = "RevealExpiredError";
  }
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
    res = await fetch(`/api/secrets/${id}`, { cache: "no-store" });
  } catch {
    throw new RevealNetworkError();
  }
  if (res.status === 410) {
    const body = (await res.json().catch(() => null)) as {
      reason?: unknown;
    } | null;
    if (body?.reason === "expired") throw new RevealExpiredError();
    throw new RevealBurnedError();
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
