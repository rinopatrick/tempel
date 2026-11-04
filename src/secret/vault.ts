import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StoredEnvelope } from "./crypto";
import { nextSecretState, type SecretState } from "./secret-state";

export const DEFAULT_TTL_MS = 3_600_000;

export type GoneReason = "burned" | "expired" | "unknown";

export interface SecretVault {
  store(id: string, envelope: StoredEnvelope, expiresAt?: number): void;
  reveal(id: string): StoredEnvelope | null;
  status(id: string): SecretState | null;
  goneReason(id: string): GoneReason | null;
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
    goneReason(id) {
      const entry = vault.get(id);
      if (entry === undefined) return "unknown";
      burnExpired(entry);
      if (entry.state === "burned") return "burned";
      if (entry.state === "expired") return "expired";
      if (entry.state === "viewable") return "burned";
      return null;
    },
  };
}

interface FileVaultRow {
  ciphertext: string;
  iv: string;
  expires_at: number;
  state: SecretState;
}

// Persistent store: one SQLite file, atomic burn via a single conditional
// UPDATE inside an IMMEDIATE transaction. Same SecretVault shape as memory.
export function createFileVault(dbPath: string): SecretVault {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // WAL lets readers proceed while a burn holds the write lock; a bounded
  // busy timeout makes a losing revealer wait for the winner's COMMIT and
  // then observe the burned row instead of throwing SQLITE_BUSY.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(
    `CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      state TEXT NOT NULL
    )`,
  );
  const storeStmt = db.prepare(
    `INSERT OR REPLACE INTO secrets (id, ciphertext, iv, expires_at, state)
     VALUES (?, ?, ?, ?, 'created')`,
  );
  const getStmt = db.prepare(`SELECT ciphertext, iv, expires_at, state FROM secrets WHERE id = ?`);
  const expireStmt = db.prepare(
    `UPDATE secrets SET ciphertext = '', iv = '', state = 'expired'
     WHERE id = ? AND state = 'created'`,
  );
  // Atomic burn: SELECT the envelope, then flip created -> burned with a
  // conditional UPDATE in the same IMMEDIATE transaction. Only a row that
  // is still live at UPDATE time flips (changes === 1); the loser or an
  // entry whose TTL lapsed mid-call gets null. The winner check below is
  // what keeps the single-open guarantee across processes.
  const burnStmt = db.prepare(
    `UPDATE secrets SET ciphertext = '', iv = '', state = 'burned'
     WHERE id = ? AND state = 'created' AND expires_at > ?`,
  );

  function readRow(id: string): FileVaultRow | undefined {
    return getStmt.get(id) as FileVaultRow | undefined;
  }

  function burnIfExpired(id: string, row: FileVaultRow): FileVaultRow {
    if (row.state === "created" && Date.now() >= row.expires_at) {
      expireStmt.run(id);
      return { ...row, ciphertext: "", iv: "", state: "expired" };
    }
    return row;
  }

  return {
    store(id, envelope, expiresAt = Date.now() + DEFAULT_TTL_MS) {
      storeStmt.run(id, envelope.ciphertext, envelope.iv, expiresAt);
    },
    reveal(id) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = readRow(id);
        let claimed: { ciphertext: string; iv: string } | null = null;
        if (
          row !== undefined &&
          row.state === "created" &&
          Date.now() < row.expires_at
        ) {
          claimed = { ciphertext: row.ciphertext, iv: row.iv };
          const burned = burnStmt.run(id, Date.now());
          if (Number(burned.changes) !== 1) {
            claimed = null;
            burnIfExpired(id, row);
          }
        } else if (row !== undefined) {
          burnIfExpired(id, row);
        }
        db.exec("COMMIT");
        return claimed;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    status(id) {
      const row = readRow(id);
      if (row === undefined) return null;
      return burnIfExpired(id, row).state;
    },
    goneReason(id) {
      const row = readRow(id);
      if (row === undefined) return "unknown";
      const current = burnIfExpired(id, row).state;
      if (current === "burned") return "burned";
      if (current === "expired") return "expired";
      if (current === "viewable") return "burned";
      return null;
    },
  };
}

function resolveDbPath(): string {
  return process.env.TEMPEL_DB_PATH ?? join(process.cwd(), "data", "secrets.db");
}

let sharedVault: SecretVault | null = null;

// File store by default, memory fallback for dev (TEMPEL_STORE=memory or
// file init failure). Contract unchanged either way.
export function getSharedVault(): SecretVault {
  if (sharedVault === null) {
    if (process.env.TEMPEL_STORE === "memory") {
      sharedVault = createSecretVault();
    } else {
      try {
        sharedVault = createFileVault(resolveDbPath());
      } catch (error) {
        console.error("[tempel] file store unavailable, memory fallback", error);
        sharedVault = createSecretVault();
      }
    }
  }
  return sharedVault;
}

// Test seam: drop the cached shared vault between cases.
export function resetSharedVault(): void {
  sharedVault = null;
}
