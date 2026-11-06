# ADR-0001 — Deploy target and reproducible release

Date: 2026-11-06. Status: accepted. Issue: #9.

## Context

Tempel ships a Next.js app with a SQLite file store at `data/secrets.db`.
The limiter reads the client IP from `x-forwarded-for` first. That header
is only trustworthy when the platform overwrites it at the edge. The repo
has no locked deploy target, no health probe, and no single post-deploy
verify command beyond the burn-flow probe.

## Decision

Deploy target: single Node host running `next start` behind a trusted
proxy that overwrites `X-Forwarded-For`. The proxy owns TLS and forwards
one client address per request. The app trusts the leftmost entry only on
this target. SQLite stays a local file under `TEMPEL_DB_PATH`, mounted
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
5. Boot with production env and run `node scripts/live-probe.mjs $BASE`.
6. `GET $BASE/api/health` answers 200 `{"status":"ok"}`.

## Consequences

The limiter keeps its current header order on this target. A move to
Vercel or Cloudflare reopens this ADR and repoints `clientIp` at the
platform-owned header. Multi-replica deploy needs shared rate state plus
a shared store, both out of scope here. `data/` stays gitignored, so the
database never ships with the build.
