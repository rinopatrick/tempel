import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StoredEnvelope } from "./crypto";
import { nextSecretState, type SecretState } from "./secret-state";

export const DEFAULT_TTL_MS = 3_600_000;
const TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;

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
  // Set the busy timeout before enabling WAL so concurrent vault creation
  // and a reveal waiting for a competing burn both wait on the lock.
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA secure_delete = ON");
  db.exec(
    `CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      state TEXT NOT NULL,
      gone_at INTEGER
    )`,
  );
  const hasGoneAt = db.prepare("SELECT 1 FROM pragma_table_info('secrets') WHERE name = 'gone_at'");
  if (!hasGoneAt.get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!hasGoneAt.get()) db.exec("ALTER TABLE secrets ADD COLUMN gone_at INTEGER");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS secrets_created_expiry ON secrets (expires_at)
     WHERE state = 'created';
     CREATE INDEX IF NOT EXISTS secrets_tombstone_age ON secrets (COALESCE(gone_at, expires_at))
     WHERE state IN ('burned', 'expired')`,
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
  const expireBatchStmt = db.prepare(
    `UPDATE secrets SET ciphertext = '', iv = '', state = 'expired'
     WHERE rowid IN (
       SELECT rowid FROM secrets WHERE state = 'created' AND expires_at <= ?
       ORDER BY expires_at LIMIT ?
     )`,
  );
  const purgeBatchStmt = db.prepare(
    `DELETE FROM secrets WHERE rowid IN (
       SELECT rowid FROM secrets
       WHERE state IN ('burned', 'expired') AND COALESCE(gone_at, expires_at) <= ?
       ORDER BY COALESCE(gone_at, expires_at) LIMIT ?
     )`,
  );
  // Atomic burn: SELECT the envelope, then flip created -> burned with a
  // conditional UPDATE in the same IMMEDIATE transaction. Only a row that
  // is still live at UPDATE time flips (changes === 1); the loser or an
  // entry whose TTL lapsed mid-call gets null. The winner check below is
  // what keeps the single-open guarantee across processes.
  const burnStmt = db.prepare(
    `UPDATE secrets SET ciphertext = '', iv = '', state = 'burned', gone_at = ?
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
      const now = Date.now();
      try {
        expireBatchStmt.run(now, CLEANUP_BATCH_SIZE);
        purgeBatchStmt.run(now - TOMBSTONE_RETENTION_MS, CLEANUP_BATCH_SIZE);
      } catch (error) {
        console.error("[tempel] secret cleanup failed", error);
      }
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
          const burnedAt = Date.now();
          const burned = burnStmt.run(burnedAt, id, burnedAt);
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

export class VaultUnavailableError extends Error {
  constructor(cause: unknown) {
    super("File Vault unavailable", { cause });
  }
}

interface ActiveVault {
  store: "file" | "memory";
  vault: SecretVault;
}

let sharedVault: ActiveVault | VaultUnavailableError | null = null;

// File Vault by default; memory only by explicit override or after an
// initialization failure outside production.
function resolveSharedVault(): ActiveVault {
  if (sharedVault === null) {
    if (process.env.TEMPEL_STORE === "memory") {
      sharedVault = { store: "memory", vault: createSecretVault() };
    } else {
      try {
        sharedVault = { store: "file", vault: createFileVault(resolveDbPath()) };
      } catch (error) {
        if (process.env.NODE_ENV === "production") {
          console.error("[tempel] file store unavailable", error);
          sharedVault = new VaultUnavailableError(error);
        } else {
          console.error("[tempel] file store unavailable, memory fallback", error);
          sharedVault = { store: "memory", vault: createSecretVault() };
        }
      }
    }
  }
  if (sharedVault instanceof VaultUnavailableError) throw sharedVault;
  return sharedVault;
}

export function getSharedVault(): SecretVault {
  return resolveSharedVault().vault;
}

export function getSharedVaultStore(): ActiveVault["store"] {
  return resolveSharedVault().store;
}

// Test seam: drop the cached shared vault between cases.
export function resetSharedVault(): void {
  sharedVault = null;
}
