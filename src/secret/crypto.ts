export interface StoredEnvelope {
  ciphertext: string;
  iv: string;
}

export type FragmentKey = string & { readonly brand: unique symbol };

export function parseFragmentKey(raw: string): FragmentKey | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return raw as FragmentKey;
}

export interface SealedSecret {
  envelope: StoredEnvelope;
  key: FragmentKey;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding === 1) throw new Error("bad fragment key encoding");
  if (padding > 0) base64 += "=".repeat(4 - padding);
  return base64ToBytes(base64);
}

export async function encryptSecret(plaintext: string): Promise<SealedSecret> {
  const key = await crypto.subtle.generateKey(
    { length: 256, name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, key, encoder.encode(plaintext)),
  );
  const exported = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    envelope: {
      ciphertext: bytesToBase64Url(ciphertext),
      iv: bytesToBase64Url(iv),
    },
    key: bytesToBase64Url(exported) as FragmentKey,
  };
}

export async function decryptSecret(
  envelope: StoredEnvelope,
  key: FragmentKey,
): Promise<string> {
  const imported = await crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(key),
    { length: 256, name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { iv: base64UrlToBytes(envelope.iv), name: "AES-GCM" },
    imported,
    base64UrlToBytes(envelope.ciphertext),
  );
  return decoder.decode(plaintext);
}
