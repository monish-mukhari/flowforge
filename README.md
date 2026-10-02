# FlowForge

A small Zapier-style automation platform. A user creates a workflow with a webhook trigger and one or more Email or Solana actions. Webhook runs are persisted through a transactional outbox, published to Kafka, and executed by a stage-based worker.

## Start the complete stack

Docker and Docker Compose are the only prerequisites.

```bash
docker compose up --build
```

This single command starts PostgreSQL, applies Prisma migrations, seeds the available apps, starts Kafka, both APIs, the sweeper, worker, frontend, and a local email inbox.

Open:

- Web app: http://localhost:3000
- Captured development emails: http://localhost:8025
- Primary API health: http://localhost:3002/health
- Hooks API health: http://localhost:3001/health

The first image build can take a few minutes. Later starts reuse the images and named PostgreSQL volume.

```bash
docker compose down
```

To also remove local database data, explicitly run `docker compose down -v`.

## Configuration

The default configuration works for webhook and email workflows. Mailpit captures email locally, so no SMTP setup is required.

Local Compose explicitly runs the APIs in development mode and supplies an isolated local signing secret. For any non-local deployment, set `APP_ENV=production`, a random `JWT_PASSWORD` of at least 32 characters, the exact comma-separated `CORS_ORIGINS`, `APP_PUBLIC_URL`, database credentials, and SMTP settings. Production startup fails closed when the signing secret is absent.

To use the Solana action on devnet, copy `.env.example` to `.env`. Each account receives its own FlowForge devnet wallet; fund the displayed public address from a Solana devnet faucet. Wallet keys are encrypted at rest using `SOLANA_WALLET_ENCRYPTION_KEY` and are never sent to the browser. The default RPC is `https://api.devnet.solana.com`.

Browser API calls use the web app's own origin and are proxied at runtime to keep authentication cookies first-party. Set `BACKEND_INTERNAL_URL` to the backend address reachable by the running web server. Docker Compose sets it to `http://primary-backend:3002`; host-side development defaults to `http://localhost:3002`. Override `NEXT_PUBLIC_HOOKS_URL` before building when deploying remotely.

## Connector platform

Open **Connections** in the dashboard to create reusable encrypted SMTP and HTTP connections or start Slack and Google OAuth. Connection secrets are AES-256-GCM encrypted at rest and are never included in API responses. Configure `CONNECTION_ENCRYPTION_KEY` with at least 32 random characters outside local development. Slack OAuth uses the v2 authorization flow; Google Sheets uses offline OAuth with PKCE. Configure shared provider client IDs and secrets in `.env` for one-click connections, or let a user supply credentials for their own OAuth app from the Connections page. Register callback URLs under `/api/v1/connections/oauth/{provider}/callback`.

The workflow builder exposes versioned Email, Solana, HTTP Request, Slack, and Google Sheets contracts. HTTP actions only permit HTTPS public endpoints, Email can use a reusable SMTP connection, Slack posts through `chat.postMessage`, and Google Sheets appends a row through the Sheets Values API.

## Accounts and sessions

Passwords are stored with Argon2id. Email verification is temporarily disabled by
default for demo deployments; set `REQUIRE_EMAIL_VERIFICATION=true` to send a
verification message and require it before login. Access sessions last 15 minutes
and are held in an HttpOnly cookie; a rotating refresh cookie keeps the session
active for seven days. Signing out and password resets revoke server-side sessions.

To test password recovery locally, request a reset from `/forgot-password`, open the resulting Mailpit message, and follow its one-hour link. Existing development users created by an older version can log in with their current password once; the password is upgraded to Argon2id immediately.

## Services

| Service           | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `web`             | Next.js landing page, auth, dashboard, builder, and workflow detail UI               |
| `primary-backend` | Users, JWT auth, app catalog, and workflow CRUD API                                  |
| `hooks`           | Receives webhook payloads and atomically creates `ZapRun` + outbox rows              |
| `sweeper`         | Publishes pending outbox rows to the Kafka `zap-events` topic                        |
| `worker`          | Resolves webhook templates and executes versioned connector actions in sorting order |
| `postgres`        | Workflow configuration, run payloads, and transactional outbox                       |
| `kafka`           | Asynchronous workflow-stage delivery                                                 |
| `mailpit`         | Local SMTP server and browser inbox                                                  |

## Payload templates

Action inputs can reference webhook JSON with braces. For this payload:

```json
{
  "customer": { "name": "Ada", "email": "ada@example.com" },
  "payment": { "amount": "0.01" }
}
```

an Email recipient can be `{customer.email}`, and a message can contain `Hi {customer.name}`.

## Webhook security and idempotency

Each workflow receives an unguessable webhook token. The dashboard displays the complete URL; the former user-ID URL is no longer accepted. Clients may include an `Idempotency-Key` header (maximum 200 visible ASCII characters). Repeating a key for the same workflow returns success without creating another run. JSON webhook and API bodies are limited to 256 KiB by default.

## Quality and operations

The Connections page and Runs page are the operational dashboards. Connections provides versioned connector contracts, encrypted credential management, OAuth start/callback, connection tests, and removal. Runs provides status, workflow-name,
run-ID, date, and ordering filters; success and latency metrics; persistent
dead-letter notifications; immutable-snapshot replay; and per-step attempt
details. Run payloads, inputs, and outputs are sanitized by the API before they
reach the browser, with credentials, passwords, secrets, tokens, cookies, and
authorization values replaced by `[REDACTED]`.

```bash
npm test
npm run check-types
npm run build
```

After the Compose stack is healthy, `npm run smoke` exercises account creation, Mailpit verification, cookie login, workflow creation, secure webhook ingestion, queue processing, email delivery, and logout. HTTP services return stable `{ error: { code, message }, requestId }` errors, propagate `X-Request-Id`, emit structured JSON logs, and redact credentials and webhook bodies.

## Production deployment

Phase 5 adds a production Compose overlay with automatic TLS, fail-closed secrets,
database-aware readiness probes, concurrency-safe OAuth token rotation, provider
revocation, and backup/restore tooling. Follow the
[production runbook](docs/production-runbook.md) for launch, rollback, monitoring,
provider approval, and live integration acceptance.
