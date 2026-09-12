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

To use the Solana action, copy `.env.example` to `.env` and set `SOL_PRIVATE_KEY`. The implementation defaults to Solana mainnet; use `SOLANA_RPC_URL` to point it at a different RPC endpoint.

Browser-facing backend URLs default to localhost. Override `NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_HOOKS_URL` before building when deploying remotely.

## Services

| Service | Responsibility |
| --- | --- |
| `web` | Next.js landing page, auth, dashboard, builder, and workflow detail UI |
| `primary-backend` | Users, JWT auth, app catalog, and workflow CRUD API |
| `hooks` | Receives webhook payloads and atomically creates `ZapRun` + outbox rows |
| `sweeper` | Publishes pending outbox rows to the Kafka `zap-events` topic |
| `worker` | Resolves webhook templates and executes actions in sorting order |
| `postgres` | Workflow configuration, run payloads, and transactional outbox |
| `kafka` | Asynchronous workflow-stage delivery |
| `mailpit` | Local SMTP server and browser inbox |

## Payload templates

Action inputs can reference webhook JSON with braces. For this payload:

```json
{
  "customer": { "name": "Ada", "email": "ada@example.com" },
  "payment": { "amount": "0.01" }
}
```

an Email recipient can be `{customer.email}`, and a message can contain `Hi {customer.name}`.
