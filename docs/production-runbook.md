# Production runbook

Phase 5 provides a single-host Docker deployment with automatic TLS, fail-closed
application configuration, readiness probes, encrypted connector credentials,
provider token refresh/revocation, database backups, and CI validation. A managed
PostgreSQL and Kafka deployment can replace the bundled services without changing
the applications.

## Launch prerequisites

1. Point the production domain's A/AAAA records at the host and allow inbound TCP
   80/443 and UDP 443. Caddy obtains and renews the certificate automatically.
2. Copy `.env.production.example` to a secret-managed production environment file.
   Generate independent values for every password/encryption key. Never rotate
   `CONNECTION_ENCRYPTION_KEY` or `SOLANA_WALLET_ENCRYPTION_KEY` without a data
   migration because existing ciphertext depends on them.
3. Set `DATABASE_URL`. Prefer managed PostgreSQL with automated snapshots and
   point-in-time recovery. The bundled PostgreSQL is suitable only when its volume
   is placed on durable storage and separately backed up.
4. Configure a real SMTP provider. Mailpit still runs internally for Compose
   compatibility but has no published production port and is not used when
   `SMTP_ENDPOINT` points to the provider.
5. Register these exact HTTPS redirects:
   - `https://<domain>/api/v1/connections/oauth/slack/callback`
   - `https://<domain>/api/v1/connections/oauth/google-sheets/callback`
6. Enable Slack distribution with the `chat:write` bot scope. Enable the Google
   Sheets API, publish the OAuth consent screen, and complete verification for the
   sensitive Sheets scope before opening access to customers.

## Deploy and rollback

Validate the rendered configuration without printing secret values into logs:

```sh
docker compose --env-file .env.production \
  -f compose.yaml -f compose.production.yaml config --quiet
```

Deploy:

```sh
docker compose --env-file .env.production \
  -f compose.yaml -f compose.production.yaml up -d --build --wait
```

The `migrate` service applies forward-only Prisma migrations before the application
becomes healthy. Before every release, create a database backup and record the
currently deployed image/commit. Roll back application containers to that image;
if a migration is incompatible, restore the pre-release backup in a maintenance
window instead of attempting an ad-hoc reverse migration.

## Backup and recovery drill

For the bundled PostgreSQL service:

```sh
npm run db:backup -- backups/flowforge-YYYYMMDD.dump
npm run db:verify-backup -- backups/flowforge-YYYYMMDD.dump
npm run db:restore -- backups/flowforge-YYYYMMDD.dump --confirm-restore
```

`db:restore` is intentionally gated and uses `pg_restore --clean --if-exists`.
Test restoration against a disposable environment at least monthly. For managed
PostgreSQL, use the provider's snapshot/PITR tools and retain an independent export.

## Health and alerting

- Public liveness: `GET https://<domain>/`
- Backend readiness: `GET /ready` on `primary-backend:3002`
- Hooks readiness: `GET /ready` on `hooks:3001`
- Worker liveness/readiness: `GET /health` and `GET /ready` on `worker:3003`
- Sweeper readiness: `GET /ready` on `sweeper:3004`

Ship container JSON logs to the chosen log platform. Alert on container restarts,
readiness failures for two minutes, any dead-letter increase, retry backlog growth,
outbox age above one minute, PostgreSQL storage/connection saturation, Kafka
consumer lag, TLS renewal failure, and backup failure. Never log environment files,
OAuth codes, access tokens, refresh tokens, cookies, or webhook bodies.

## Release acceptance

Run `npm run verify`, then `npm run smoke` against the deployed non-production
environment. Before launch, manually complete one Slack connection/message and one
Google connection/row append using the production OAuth applications. Wait for or
force token expiry and repeat both actions to certify refresh behavior. Revoke both
grants at the provider and confirm the connection becomes `REVOKED` after its next
test or execution.
