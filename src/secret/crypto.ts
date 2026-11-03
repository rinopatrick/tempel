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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
    envelope: { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv) },
    key: bytesToBase64(exported) as FragmentKey,
  };
}

export async function decryptSecret(
  envelope: StoredEnvelope,
  key: FragmentKey,
): Promise<string> {
  const imported = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(key),
    { length: 256, name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { iv: base64ToBytes(envelope.iv), name: "AES-GCM" },
    imported,
    base64ToBytes(envelope.ciphertext),
  );
  return decoder.decode(plaintext);
}
