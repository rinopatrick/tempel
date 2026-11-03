export interface SealedSecret {
  ciphertext: string;
  key: string;
  iv: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
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
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    key: bytesToBase64(exported),
  };
}

export async function decryptSecret(sealed: SealedSecret): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(sealed.key),
    { length: 256, name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { iv: base64ToBytes(sealed.iv), name: "AES-GCM" },
    key,
    base64ToBytes(sealed.ciphertext),
  );
  return decoder.decode(plaintext);
}
