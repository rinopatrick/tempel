# Tempel staging

Use a Linux host with Docker and Docker Compose v2. Point the staging hostname's
DNS directly to that host and allow inbound TCP 80 and 443 to Caddy for TLS.
Use a bare hostname for `TEMPEL_STAGING_DOMAIN`. This setup expects Caddy to be
the first proxy that receives the client connection.

```sh
export TEMPEL_STAGING_DOMAIN=staging.example.com
docker compose -f compose.staging.yaml up --build --wait
node scripts/live-probe.mjs "https://$TEMPEL_STAGING_DOMAIN" --edge
```

The build fetches npm dependencies and the app's self-hosted fonts. Compose
starts one Node 22 app and gives it a persistent SQLite volume. Only Caddy
publishes host ports. It replaces `X-Forwarded-For` with the client address,
strips the other client-IP headers listed in [ADR-0001](adr/0001-deploy-target-and-release.md),
and forwards Reveal responses without caching them. The example uses Caddy's
[automatic HTTPS](https://caddyserver.com/docs/automatic-https).

The edge probe uses a disposable envelope. It requires HTTPS, a healthy File
Vault, and a disabled seed route. Copy the ID from `PASS POST 201` to check its
Burn in the staging database.

```sh
probe_id='<id from PASS POST 201>'
docker compose -f compose.staging.yaml exec -T app node --input-type=module - "$probe_id" <<'JS'
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.TEMPEL_DB_PATH, { readOnly: true });
try {
  const row = db.prepare("SELECT state FROM secrets WHERE id = ?").get(process.argv[2]);
  if (row?.state !== "burned") throw new Error("Expected the probe secret to be burned");
  console.log("PASS persisted burn");
} finally {
  db.close();
}
JS
```

The `vault` volume holds the SQLite database and the `caddy-data` volume holds
TLS state. A regular `docker compose -f compose.staging.yaml down` preserves
both volumes. Use the same Compose project to reuse them on the next start.
