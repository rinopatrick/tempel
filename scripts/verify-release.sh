#!/usr/bin/env bash
set -euo pipefail

probe_dir=$(mktemp -d)
export NODE_ENV=production
export TEMPEL_DB_PATH="$probe_dir/secrets.db"
export TEMPEL_PROBE_SEED=1
unset TEMPEL_STORE
server_pid=

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  if [[ $1 -ne 0 && -f "$probe_dir/server.log" ]]; then
    cat "$probe_dir/server.log"
  fi
  rm -f -- "$probe_dir/server.log" "$TEMPEL_DB_PATH"{,-wal,-shm}
  rmdir -- "$probe_dir"
}
trap 'cleanup "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 0 \
  >"$probe_dir/server.log" 2>&1 &
server_pid=$!

for ((attempt = 0; attempt < 30; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo 'The built app exited before becoming healthy.' >&2
    exit 1
  fi
  base_url=$(sed -nE 's@.*Local:[[:space:]]+(http://127\.0\.0\.1:[0-9]+).*@\1@p' "$probe_dir/server.log")
  if [[ -n "$base_url" ]] && node -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(1000) }).then(
    (res) => { process.exitCode = res.ok ? 0 : 1; },
    () => { process.exitCode = 1; },
  )' "$base_url/api/health"; then
    break
  fi
  sleep 1
done

if ((attempt == 30)); then
  echo 'Timed out waiting for the built app.' >&2
  exit 1
fi

node scripts/live-probe.mjs "$base_url"
if grep -Fq '[tempel] file store unavailable' "$probe_dir/server.log"; then
  echo 'The app reported a File Vault initialization failure.' >&2
  exit 1
fi

node --input-type=module <<'JS'
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.TEMPEL_DB_PATH, { readOnly: true });
try {
  const rows = db.prepare(
    "SELECT state, count(*) AS count FROM secrets WHERE state IN ('burned', 'expired') GROUP BY state",
  ).all();
  const counts = Object.fromEntries(rows.map(({ state, count }) => [state, count]));
  if (counts.burned !== 1 || counts.expired !== 1) {
    throw new Error(`Expected one burned and one expired row in the fresh SQLite file: ${JSON.stringify(counts)}`);
  }
  console.log("PASS SQLite persisted one burned and one expired row");
} finally {
  db.close();
}
JS
