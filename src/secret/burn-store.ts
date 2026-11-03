export interface BurnStore {
  put(id: string, ciphertext: string): void;
  take(id: string): string | null;
}

export function createBurnStore(): BurnStore {
  const vault = new Map<string, string>();
  return {
    put(id, ciphertext) {
      vault.set(id, ciphertext);
    },
    take(id) {
      const hit = vault.get(id);
      if (hit === undefined) return null;
      vault.delete(id);
      return hit;
    },
  };
}
