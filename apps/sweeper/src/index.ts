import prisma from "@repo/db/client";
import type { Prisma } from "@prisma/client";
import { createServer } from "node:http";
import { Kafka } from "kafkajs";
import pino from "pino";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";

const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    KAFKA_BROKERS: z.string().min(1),
    SWEEP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(3000),
    METRICS_PORT: z.coerce.number().int().min(1).max(65_535).default(3004),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .parse(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const kafka = new Kafka({
  clientId: "sweeper",
  brokers: config.KAFKA_BROKERS.split(",").map((value) => value.trim()),
});
let stopping = false;
let ready = false;
let lastSweepAt: Date | undefined;

function startHealthServer() {
  return createServer(async (req, res) => {
    if (req.url !== "/health" && req.url !== "/ready") {
      res.writeHead(404).end();
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "sweeper" }));
      return;
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
      const status = ready && !stopping ? 200 : 503;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: status === 200 ? "ready" : "unavailable",
          service: "sweeper",
          lastSweepAt: lastSweepAt?.toISOString() ?? null,
        }),
      );
    } catch {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "unavailable", service: "sweeper" }));
    }
  }).listen(config.METRICS_PORT, "0.0.0.0", () =>
    logger.info({ port: config.METRICS_PORT }, "sweeper health server started"),
  );
}

async function recoverExpiredLeases() {
  const now = new Date();
  const expired = await prisma.zapRunStep.findMany({
    where: { status: "RUNNING", leaseExpiresAt: { lt: now } },
    select: {
      id: true,
      zapRunId: true,
      sortingOrder: true,
      attemptCount: true,
      maxAttempts: true,
    },
    take: 100,
  });
  for (const step of expired) {
    await prisma.$transaction(async (tx) => {
      const retry = step.attemptCount < step.maxAttempts;
      const recovered = await tx.zapRunStep.updateMany({
        where: { id: step.id, status: "RUNNING", leaseExpiresAt: { lt: now } },
        data: {
          status: retry ? "RETRY_SCHEDULED" : "DEAD_LETTER",
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: now,
          lastError: "Worker lease expired before completion",
          ...(!retry ? { completedAt: now } : {}),
        },
      });
      if (!recovered.count) return;
      await tx.zapRunAttempt.updateMany({
        where: {
          zapRunStepId: step.id,
          attemptNumber: step.attemptCount,
          status: "RUNNING",
        },
        data: {
          status: "FAILED",
          errorCode: "WORKER_LEASE_EXPIRED",
          errorMessage: "Worker lease expired before completion",
          completedAt: now,
        },
      });
      await tx.zapRun.update({
        where: { id: step.zapRunId },
        data: {
          status: retry ? "QUEUED" : "DEAD_LETTER",
          lastError: "Worker lease expired before completion",
          ...(!retry ? { completedAt: now } : {}),
        },
      });
      if (retry)
        await tx.zapRunOutbox.upsert({
          where: { zapRunId: step.zapRunId },
          create: {
            zapRunId: step.zapRunId,
            stage: step.sortingOrder,
            availableAt: now,
          },
          update: { stage: step.sortingOrder, availableAt: now },
        });
    });
  }
  if (expired.length)
    logger.warn({ count: expired.length }, "expired worker leases recovered");
}

async function publishAvailable(
  producer: Awaited<ReturnType<typeof kafka.producer>>,
) {
  const now = new Date();
  const pendingRows = await prisma.zapRunOutbox.findMany({
    where: { availableAt: { lte: now } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
  if (!pendingRows.length) return;
  await producer.send({
    topic: "zap-events",
    messages: pendingRows.map((row) => ({
      key: row.zapRunId,
      value: JSON.stringify({ zapRunId: row.zapRunId, stage: row.stage }),
    })),
  });
  await prisma.zapRunOutbox.deleteMany({
    where: { id: { in: pendingRows.map((row) => row.id) } },
  });
  logger.info({ count: pendingRows.length }, "outbox batch published");
}

async function logQueueHealth() {
  const [ready, retryScheduled, leased, deadLetter] = await Promise.all([
    prisma.zapRunOutbox.count({ where: { availableAt: { lte: new Date() } } }),
    prisma.zapRunStep.count({ where: { status: "RETRY_SCHEDULED" } }),
    prisma.zapRunStep.count({ where: { status: "RUNNING" } }),
    prisma.zapRun.count({ where: { status: "DEAD_LETTER" } }),
  ]);
  logger.info({ ready, retryScheduled, leased, deadLetter }, "queue health");
}

async function enqueueTriggeredRun(zap: any, version: any, metadata: Record<string, unknown>, key: string) {
  const snapshot = version?.definition as { actions?: Array<{ availableActionId: string; connectorVersion?: number; actionMetadata?: unknown; sortingOrder: number }> } | undefined;
  if (!snapshot?.actions) return;
  try {
    await prisma.zapRun.create({
      data: {
        id: randomUUID(), zapId: zap.id, workflowVersionId: version.id,
        definitionSnapshot: version.definition as Prisma.InputJsonValue, metadata: metadata as Prisma.InputJsonValue, idempotencyKey: key,
        status: "QUEUED",
        steps: { create: snapshot.actions.map((action) => ({ sortingOrder: action.sortingOrder, actionType: action.availableActionId, connectorVersion: action.connectorVersion ?? 1, input: (action.actionMetadata ?? {}) as any, idempotencyKey: `${key}:${action.sortingOrder}` })) },
        zapRunOutbox: { create: { stage: 0 } },
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
  }
}

async function scheduleRuns() {
  const zaps = await prisma.zap.findMany({
    where: { status: "PUBLISHED" },
    include: { trigger: true, versions: true },
  });
  const now = Date.now();
  for (const zap of zaps) {
    const trigger = zap.trigger;
    if (!trigger || !["schedule", "polling"].includes(trigger.triggerId)) continue;
    const metadata = (trigger.metadata ?? {}) as Record<string, unknown>;
    const intervalSeconds = Math.max(10, Number(metadata.intervalSeconds ?? 60));
    const slot = Math.floor(now / (intervalSeconds * 1000));
    const version = zap.versions.find((item) => item.version === zap.publishedVersion);
    if (!version) continue;
    if (trigger.triggerId === "schedule") {
      await enqueueTriggeredRun(zap, version, { trigger: { type: "schedule", firedAt: new Date().toISOString() } }, `schedule:${zap.id}:${slot}`);
      continue;
    }
    const url = String(metadata.url ?? "");
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") continue;
      const response = await fetch(parsed, { method: String(metadata.method ?? "GET"), headers: { accept: "application/json", ...(metadata.headers && typeof metadata.headers === "object" ? metadata.headers as Record<string, string> : {}) } });
      const body = (await response.text()).slice(0, 64_000);
      const hash = createHash("sha256").update(body).digest("hex");
      if (hash === metadata.lastPollHash) continue;
      await enqueueTriggeredRun(zap, version, { trigger: { type: "polling", url, status: response.status }, poll: { body } }, `polling:${zap.id}:${hash}`);
      await prisma.trigger.update({ where: { id: trigger.id }, data: { metadata: { ...metadata, lastPollHash: hash, lastPolledAt: new Date().toISOString() } as Prisma.InputJsonValue } });
    } catch (error) {
      logger.warn({ zapId: zap.id, err: error }, "polling trigger failed");
    }
  }
}

async function main() {
  const producer = kafka.producer();
  const shutdown = (signal: string) => {
    stopping = true;
    logger.info({ signal }, "sweeper shutting down gracefully");
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic: "zap-events", numPartitions: 3, replicationFactor: 1 }],
  });
  await admin.disconnect();
  await producer.connect();
  ready = true;
  const healthServer = startHealthServer();
  logger.info("sweeper started");
  let sweepCount = 0;
  while (!stopping) {
    await scheduleRuns();
    await recoverExpiredLeases();
    await publishAvailable(producer);
    lastSweepAt = new Date();
    if (sweepCount++ % 20 === 0) await logQueueHealth();
    await new Promise((resolve) =>
      setTimeout(resolve, config.SWEEP_INTERVAL_MS),
    );
  }
  ready = false;
  healthServer.close();
  await producer.disconnect();
  await prisma.$disconnect();
}

main().catch((error) => {
  logger.fatal({ err: error }, "sweeper stopped unexpectedly");
  process.exit(1);
});
