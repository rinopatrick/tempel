import type { StoredEnvelope } from "./crypto";
import { nextSecretState, type SecretState } from "./secret-state";

export interface SecretVault {
  store(id: string, envelope: StoredEnvelope): void;
  reveal(id: string): StoredEnvelope | null;
  status(id: string): SecretState | null;
}

interface VaultEntry {
  envelope: StoredEnvelope | null;
  state: SecretState;
}

export function createSecretVault(): SecretVault {
  const vault = new Map<string, VaultEntry>();
  return {
    store(id, envelope) {
      vault.set(id, { envelope: { ...envelope }, state: "created" });
    },
    reveal(id) {
      const entry = vault.get(id);
      if (entry === undefined) return null;
      const viewable = nextSecretState(entry.state, "reveal");
      if (viewable !== "viewable") return null;
      const envelope = entry.envelope === null ? null : { ...entry.envelope };
      entry.envelope = null;
      entry.state = nextSecretState(viewable, "burn");
      return envelope;
    },
    status(id) {
      const entry = vault.get(id);
      return entry === undefined ? null : entry.state;
    },
  };
}

const sharedVault = createSecretVault();

// Single-instance memory only. Resets on restart, no cross-replica burn
// guarantee. A persistent store follows without changing this contract.
export function getSharedVault(): SecretVault {
  return sharedVault;
}
