# ADR-0001 — Deploy target and reproducible release

Date: 2026-11-06. Status: accepted. Issue: #9.

The proxy requirements below clarify the original decision; the deployment target is unchanged.

## Context

Tempel ships a Next.js app with a SQLite file store at `data/secrets.db`.
The limiter checks `CF-Connecting-IP`, `X-Vercel-Forwarded-For`,
`X-Forwarded-For`, then `X-Real-IP`. On a single host behind a trusted
proxy, only the client address set by that proxy is trustworthy.

## Decision

Deploy target: single Node host running `next start` behind a trusted
proxy that terminates TLS, replaces `X-Forwarded-For` with one verified
client address, and strips `CF-Connecting-IP`, `X-Vercel-Forwarded-For`,
and `X-Real-IP` before forwarding. Only the proxy can reach the Node
origin. SQLite stays a local file under `TEMPEL_DB_PATH`, mounted
persistently. No multi-replica writes in v1.

Env contract, all required in production:

- `TEMPEL_DB_PATH`: absolute path to the SQLite file on persistent disk.
- `TEMPEL_STORE`: unset (file store). `memory` is dev only.
- `TEMPEL_PROBE_SEED`: unset or `0` in production, `1` only for the
  pre-release verify run. The seed route answers 404 without it.
- `PORT`: the port `next start` binds.

Reproducible release checklist, same order every time:

1. `npm ci`.
2. `npx tsc --noEmit`.
3. `npm test -- --run`.
4. `npm run build`.
5. Run the [isolated launch probe and storage and edge checks](../security-acceptance.md#launch-gate).
   On the release instance, `GET /api/health` answers 200 `{"status":"ok","store":"file"}`.
   A 503 `{"status":"unavailable","store":"file"}` means the File Vault
   failed to initialize.

The [staging Compose setup](../staging.md) implements this target with Caddy and
a persistent SQLite volume on one host.

## Consequences

The limiter keeps its current header order on this target. A move to
Vercel or Cloudflare reopens this ADR and repoints `clientIp` at the
platform-owned header. Multi-replica deploy needs shared rate state plus
a shared store, both out of scope here. `data/` stays gitignored, so the
database never ships with the build.
