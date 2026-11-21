<img src="assets/logo.svg" width="480" alt="Tempel logo">

# tempel

Send a secret. The link burns on first open.

Tempel shares passwords and API keys through links that work once. Your browser encrypts the secret with AES-256-GCM before it leaves your machine. The server stores only ciphertext. The key travels in the URL fragment, and browsers never send fragments to servers. The server cannot read your secret. The create endpoint rejects any body that contains `key` or `plaintext`, so plaintext has no path to the server.

## How a secret flows

1. You type a secret and pick an expiry of 1, 6, or 24 hours.
2. The browser encrypts it and POSTs `{ ciphertext, iv, ttlSeconds }` to `/api/secrets`. The server answers `201 { id }`.
3. The browser builds `${origin}/s/${id}#${key}` and shows the link. Copy it and send it through any channel.
4. The recipient opens the link. The page fetches `/api/secrets/${id}` and decrypts the answer locally with the fragment key.
5. The first read burns the server row in one atomic step. The next open gets `410 { error: "gone", reason: "burned" }`. A link left unopened past its TTL gets `410` with reason `"expired"`.

Every secret runs `created → viewable → burned`, or `created → expired`. Nothing leaves `burned` or `expired`.

On each new store, SQLite clears a batch of expired envelopes and removes a batch of tombstones at least seven days past the burn or expiry. Once removed, the link returns `404` instead of `410`. There is no background cleanup.

## Abuse limits

Each IP gets 10 creates and 60 reveals per minute. Past the cap the API answers `429` with a `Retry-After` header. The IP comes from `cf-connecting-ip` first, then `x-vercel-forwarded-for`, `x-forwarded-for`, and `x-real-ip`. Run behind a proxy you trust, because a forged header sends the cap after the wrong address. `docs/adr/0001-deploy-target-and-release.md` records the deploy target this order assumes.

## Run it locally

You need Node 22.13+ (minimum) and npm. This is the first Node 22 release
that loads `node:sqlite` without an experimental flag.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000` and create a secret. Open the link it returns in a second tab. That tab burns the link. Reload it and you get the burned page.

## Checks

See the [v1 threat model and security launch gate](docs/security-acceptance.md).

```sh
npx tsc --noEmit
npm test -- --run
```

## Ship it

The supported target is one Node host running `next start` behind a trusted TLS proxy. It replaces `X-Forwarded-For` and strips the other client-IP headers as specified in [ADR-0001](docs/adr/0001-deploy-target-and-release.md). SQLite lives in a file on persistent disk. The database never ships with the build, because `data/` is gitignored.

```sh
npm ci
npx tsc --noEmit
npm test -- --run
npm run build
bash scripts/verify-release.sh
TEMPEL_DB_PATH=/var/lib/tempel/secrets.db PORT=3111 node_modules/.bin/next start
```

The [staging setup](docs/staging.md) runs the same app behind a TLS proxy and includes the [edge checks](docs/security-acceptance.md#launch-gate).

`GET /api/health` answers `200 { "status": "ok", "store": "file" }` for a
healthy production File Vault, or `503 { "status": "unavailable", "store": "file" }`
if it cannot initialize. A running memory store reports `"store": "memory"`.

| Variable | Meaning |
|---|---|
| `TEMPEL_DB_PATH` | SQLite file path. Defaults to `data/secrets.db`. |
| `TEMPEL_STORE` | Set to `memory` for dev only. Leave unset in production. |
| `TEMPEL_PROBE_SEED` | Set to `1` only for the pre-release verify run. The seed route answers 404 without it. |
| `PORT` | Port that `next start` binds. |

## Stack

Next.js 15 and React 19 for the app. Tailwind CSS 4 for styling. `node:sqlite` for the store. AES-256-GCM through WebCrypto in the browser. Vitest for tests.
