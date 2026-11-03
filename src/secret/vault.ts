import type { StoredEnvelope } from "./crypto";
import { nextSecretState, type SecretState } from "./secret-state";

export const DEFAULT_TTL_MS = 3_600_000;

export interface SecretVault {
  store(id: string, envelope: StoredEnvelope, expiresAt?: number): void;
  reveal(id: string): StoredEnvelope | null;
  status(id: string): SecretState | null;
}

interface VaultEntry {
  envelope: StoredEnvelope | null;
  state: SecretState;
  expiresAt: number;
}

function burnExpired(entry: VaultEntry): void {
  if (entry.state === "created" && Date.now() >= entry.expiresAt) {
    entry.envelope = null;
    entry.state = nextSecretState("created", "expire");
  }
}

export function createSecretVault(): SecretVault {
  const vault = new Map<string, VaultEntry>();
  return {
    store(id, envelope, expiresAt = Date.now() + DEFAULT_TTL_MS) {
      vault.set(id, { envelope: { ...envelope }, expiresAt, state: "created" });
    },
    reveal(id) {
      const entry = vault.get(id);
      if (entry === undefined) return null;
      burnExpired(entry);
      const viewable = nextSecretState(entry.state, "reveal");
      if (viewable !== "viewable") return null;
      const envelope = entry.envelope === null ? null : { ...entry.envelope };
      entry.envelope = null;
      entry.state = nextSecretState(viewable, "burn");
      return envelope;
    },
    status(id) {
      const entry = vault.get(id);
      if (entry === undefined) return null;
      burnExpired(entry);
      return entry.state;
    },
  };
}

const sharedVault = createSecretVault();

// Single-instance memory only. Resets on restart, no cross-replica burn
// guarantee. A persistent store follows without changing this contract.
export function getSharedVault(): SecretVault {
  return sharedVault;
}
