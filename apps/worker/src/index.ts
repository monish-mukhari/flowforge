import "dotenv/config";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { Kafka, type Consumer } from "kafkajs";
import prisma from "@repo/db/client";
import type { Prisma } from "@prisma/client";
import pino from "pino";
import { z } from "zod";
import { parse } from "./parser";
import { sendSol } from "./solana";
import { executeConnectorAction } from "./connector-executors";
import {
  executionErrorMessage,
  retryDelayMs,
  shouldRetry,
} from "./execution-policy";

const config = z
  .object({
    APP_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1),
    KAFKA_BROKERS: z.string().min(1),
    WORKER_ID: z.string().min(1).default(`${hostname()}-${process.pid}`),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
    WORKER_LEASE_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(30_000),
    ACTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(20_000),
    RETRY_BASE_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    METRICS_PORT: z.coerce.number().int().min(1).max(65_535).default(3003),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CONNECTION_ENCRYPTION_KEY: z.string().min(32).optional(),
    SOLANA_WALLET_ENCRYPTION_KEY: z.string().min(32).optional(),
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .parse(process.env);
if (config.APP_ENV === "production" && !config.CONNECTION_ENCRYPTION_KEY)
  throw new Error("CONNECTION_ENCRYPTION_KEY is required in production");
if (config.APP_ENV === "production" && !config.SOLANA_WALLET_ENCRYPTION_KEY)
  throw new Error("SOLANA_WALLET_ENCRYPTION_KEY is required in production");
for (const [provider, clientId, clientSecret] of [
  ["Slack", config.SLACK_CLIENT_ID, config.SLACK_CLIENT_SECRET],
  ["Google", config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET],
] as const)
  if (Boolean(clientId) !== Boolean(clientSecret))
    throw new Error(
      `${provider} OAuth requires both a client ID and client secret`,
    );

const eventSchema = z
  .object({
    zapRunId: z.string().uuid(),
    stage: z.number().int().min(0).max(10_000),
  })
  .strict();
const metadataSchema = z.record(z.string(), z.unknown());
const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ["email", "body", "address", "metadata", "input", "output"],
    censor: "[REDACTED]",
  },
});
const kafka = new Kafka({
  clientId: "worker",
  brokers: config.KAFKA_BROKERS.split(",").map((value) => value.trim()),
});

let consumer: Consumer | undefined;
let shuttingDown = false;
let workerReady = false;

async function withTimeout<T>(operation: Promise<T>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("ACTION_TIMEOUT")),
          config.ACTION_TIMEOUT_MS,
        );
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function claimStep(zapRunId: string, stage: number) {
  const now = new Date();
  const claimed = await prisma.zapRunStep.updateMany({
    where: {
      zapRunId,
      sortingOrder: stage,
      status: { in: ["PENDING", "RETRY_SCHEDULED"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: "RUNNING",
      leaseOwner: config.WORKER_ID,
      leaseExpiresAt: new Date(now.getTime() + config.WORKER_LEASE_MS),
      attemptCount: { increment: 1 },
      startedAt: now,
    },
  });
  if (claimed.count !== 1) return null;
  const step = await prisma.zapRunStep.findUnique({
    where: { zapRunId_sortingOrder: { zapRunId, sortingOrder: stage } },
    include: {
      zapRun: {
        select: {
          metadata: true,
          status: true,
          startedAt: true,
          zap: { select: { id: true, userId: true, name: true } },
        },
      },
    },
  });
  if (!step) return null;
  await prisma.$transaction([
    prisma.zapRunAttempt.create({
      data: {
        zapRunStepId: step.id,
        attemptNumber: step.attemptCount,
        workerId: config.WORKER_ID,
      },
    }),
    prisma.zapRun.update({
      where: { id: zapRunId },
      data: {
        status: "RUNNING",
        startedAt: step.zapRun.startedAt ? undefined : now,
        completedAt: null,
      },
    }),
  ]);
  return step;
}

async function executeStep(
  step: NonNullable<Awaited<ReturnType<typeof claimStep>>>,
) {
  const actionMetadata = metadataSchema.parse(step.input);
  const previous = await prisma.zapRunStep.findMany({
    where: { zapRunId: step.zapRunId, status: "SUCCEEDED" },
    orderBy: { sortingOrder: "asc" },
    select: { sortingOrder: true, output: true },
  });
  const runMetadata = {
    ...metadataSchema.parse(step.zapRun.metadata),
    steps: Object.fromEntries(previous.map((item) => [item.sortingOrder, item.output ?? {}])),
    last: previous.at(-1)?.output ?? {},
  };
  if (step.actionType === "delay") {
    const delayMs = Math.min(300_000, Math.max(0, Number(actionMetadata.delayMs ?? 0)));
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { delayedMs: delayMs };
  }
  if (step.actionType === "transform") {
    const source = actionMetadata.input === undefined
      ? runMetadata
      : JSON.parse(parse(String(actionMetadata.input), runMetadata));
    const operation = String(actionMetadata.operation ?? "identity");
    if (operation === "json") return { value: source };
    if (operation === "pick") {
      const path = String(actionMetadata.path ?? "").split(".").filter(Boolean);
      let value: unknown = source;
      for (const key of path) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
      return { value };
    }
    if (operation === "set") return { value: { [String(actionMetadata.path ?? "value")]: actionMetadata.value } };
    return { value: source };
  }
  if (step.actionType === "filter" || step.actionType === "branch") {
    const left = actionMetadata.input === undefined ? runMetadata : parse(String(actionMetadata.input), runMetadata);
    const right = actionMetadata.value;
    const operator = String(actionMetadata.operator ?? "equals");
    const matches = operator === "notEquals" ? left !== right : operator === "contains" ? String(left).includes(String(right)) : left === right;
    return { matched: matches, branch: matches ? "true" : "false" };
  }
  if (step.actionType === "loop") {
    const items = JSON.parse(parse(String(actionMetadata.items ?? "[]"), runMetadata)) as unknown;
    if (!Array.isArray(items)) throw new Error("Loop items must be a JSON array");
    const nested = metadataSchema.parse(actionMetadata.action ?? {});
    const results: unknown[] = [];
    for (const item of items) {
      results.push(await executeConnectorAction({
        actionType: String(nested.actionType), connectorVersion: 1,
        actionMetadata: nested.actionMetadata && typeof nested.actionMetadata === "object" ? nested.actionMetadata as Record<string, unknown> : {},
        runMetadata: { ...runMetadata, item }, userId: step.zapRun.zap.userId,
        idempotencyKey: `${step.idempotencyKey}:${results.length}`,
      }));
    }
    return { count: results.length, results };
  }
  const connectorResult = await executeConnectorAction({
    actionType: step.actionType,
    connectorVersion: step.connectorVersion,
    actionMetadata,
    runMetadata,
    userId: step.zapRun.zap.userId,
    idempotencyKey: step.idempotencyKey,
  });
  if (connectorResult) return connectorResult;
  if (step.actionType === "solana") {
    const wallet = await prisma.solanaWallet.findUnique({
      where: { userId: step.zapRun.zap.userId },
      select: { encryptedSecretKey: true, network: true },
    });
    if (!wallet)
      throw new Error("Solana wallet is not configured for this account");
    if (wallet.network !== "devnet")
      throw new Error(`Unsupported Solana wallet network: ${wallet.network}`);
    const transfer = await sendSol(
      parse(String(actionMetadata.address ?? ""), runMetadata),
      parse(String(actionMetadata.amount ?? ""), runMetadata),
      wallet.encryptedSecretKey,
    );
    return transfer;
  }
  throw new Error(`Unsupported action type: ${step.actionType}`);
}

async function completeStep(
  step: NonNullable<Awaited<ReturnType<typeof claimStep>>>,
  output: Record<string, unknown>,
) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const released = await tx.zapRunStep.updateMany({
      where: { id: step.id, status: "RUNNING", leaseOwner: config.WORKER_ID },
      data: {
        status: "SUCCEEDED",
        output: output as Prisma.InputJsonValue,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
      },
    });
    if (released.count !== 1)
      throw new Error("Worker lease was lost before completion");
    await tx.zapRunAttempt.update({
      where: {
        zapRunStepId_attemptNumber: {
          zapRunStepId: step.id,
          attemptNumber: step.attemptCount,
        },
      },
      data: {
        status: "SUCCEEDED",
        output: output as Prisma.InputJsonValue,
        completedAt: now,
      },
    });
    const next = await tx.zapRunStep.findUnique({
      where: {
        zapRunId_sortingOrder: {
          zapRunId: step.zapRunId,
          sortingOrder: step.sortingOrder + 1,
        },
      },
      select: { sortingOrder: true },
    });
    if (next) {
      await tx.zapRunOutbox.upsert({
        where: { zapRunId: step.zapRunId },
        create: { zapRunId: step.zapRunId, stage: next.sortingOrder },
        update: { stage: next.sortingOrder, availableAt: now },
      });
    } else {
      await tx.zapRun.update({
        where: { id: step.zapRunId },
        data: { status: "SUCCEEDED", completedAt: now, lastError: null },
      });
    }
  });
}

async function failStep(
  step: NonNullable<Awaited<ReturnType<typeof claimStep>>>,
  error: unknown,
) {
  const now = new Date();
  const message = executionErrorMessage(error);
  const timedOut = message === "ACTION_TIMEOUT";
  const retry = shouldRetry(step.attemptCount, step.maxAttempts);
  const backoff = retryDelayMs(step.attemptCount, config.RETRY_BASE_MS);
  const nextAttemptAt = new Date(now.getTime() + backoff);
  await prisma.$transaction(async (tx) => {
    await tx.zapRunAttempt.update({
      where: {
        zapRunStepId_attemptNumber: {
          zapRunStepId: step.id,
          attemptNumber: step.attemptCount,
        },
      },
      data: {
        status: timedOut ? "TIMED_OUT" : "FAILED",
        errorCode: timedOut ? "ACTION_TIMEOUT" : "ACTION_FAILED",
        errorMessage: message,
        completedAt: now,
      },
    });
    await tx.zapRunStep.update({
      where: { id: step.id },
      data: {
        status: retry ? "RETRY_SCHEDULED" : "DEAD_LETTER",
        lastError: message,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt,
        ...(!retry ? { completedAt: now } : {}),
      },
    });
    await tx.zapRun.update({
      where: { id: step.zapRunId },
      data: {
        status: retry ? "QUEUED" : "DEAD_LETTER",
        lastError: message,
        ...(!retry ? { completedAt: now } : {}),
      },
    });
    if (!retry) {
      await tx.runNotification.upsert({
        where: { zapRunId: step.zapRunId },
        create: {
          userId: step.zapRun.zap.userId,
          zapId: step.zapRun.zap.id,
          zapRunId: step.zapRunId,
          title: `Workflow failed: ${step.zapRun.zap.name}`,
          message: `Run ${step.zapRunId.slice(0, 8)} moved to dead letter after ${step.attemptCount} attempts.`,
        },
        update: {
          title: `Workflow failed: ${step.zapRun.zap.name}`,
          message: `Run ${step.zapRunId.slice(0, 8)} moved to dead letter after ${step.attemptCount} attempts.`,
          readAt: null,
        },
      });
    }
    if (retry) {
      await tx.zapRunOutbox.upsert({
        where: { zapRunId: step.zapRunId },
        create: {
          zapRunId: step.zapRunId,
          stage: step.sortingOrder,
          availableAt: nextAttemptAt,
        },
        update: { stage: step.sortingOrder, availableAt: nextAttemptAt },
      });
    }
  });
  logger[retry ? "warn" : "error"](
    {
      zapRunId: step.zapRunId,
      stage: step.sortingOrder,
      attempt: step.attemptCount,
      error: message,
    },
    retry
      ? "workflow step scheduled for retry"
      : "workflow step moved to dead letter",
  );
}

async function processEvent(zapRunId: string, stage: number) {
  const step = await claimStep(zapRunId, stage);
  if (!step) {
    logger.debug(
      { zapRunId, stage },
      "duplicate, early, or completed event ignored",
    );
    return;
  }
  const heartbeat = setInterval(
    () => {
      void prisma.zapRunStep.updateMany({
        where: { id: step.id, status: "RUNNING", leaseOwner: config.WORKER_ID },
        data: { leaseExpiresAt: new Date(Date.now() + config.WORKER_LEASE_MS) },
      });
    },
    Math.max(1_000, Math.floor(config.WORKER_LEASE_MS / 3)),
  );
  heartbeat.unref();
  try {
    const output = await withTimeout(executeStep(step));
    await completeStep(step, output);
    logger.info(
      {
        zapRunId,
        stage,
        actionType: step.actionType,
        attempt: step.attemptCount,
      },
      "workflow step completed",
    );
  } catch (error) {
    const policy = metadataSchema.parse(step.input).onError;
    if (policy === "continue") {
      await completeStep(step, { error: executionErrorMessage(error), continued: true });
      logger.warn({ zapRunId, stage }, "workflow step failed and continued by policy");
    } else {
      await failStep(step, error);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

function startHealthServer() {
  return createServer(async (req, res) => {
    if (!["/health", "/ready", "/metrics"].includes(req.url ?? "")) {
      res.writeHead(404).end();
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "worker" }));
      return;
    }
    try {
      const [queued, running, deadLetter, retryScheduled] = await Promise.all([
        prisma.zapRun.count({ where: { status: "QUEUED" } }),
        prisma.zapRun.count({ where: { status: "RUNNING" } }),
        prisma.zapRun.count({ where: { status: "DEAD_LETTER" } }),
        prisma.zapRunStep.count({ where: { status: "RETRY_SCHEDULED" } }),
      ]);
      const status = workerReady && !shuttingDown ? 200 : 503;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: status === 200 ? "ready" : "unavailable",
          service: "worker",
          queue: { queued, running, retryScheduled, deadLetter },
        }),
      );
    } catch {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "unavailable", service: "worker" }));
    }
  }).listen(config.METRICS_PORT, "0.0.0.0", () =>
    logger.info({ port: config.METRICS_PORT }, "worker health server started"),
  );
}

async function main() {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic: "zap-events", numPartitions: 3, replicationFactor: 1 }],
  });
  await admin.disconnect();
  consumer = kafka.consumer({ groupId: "main-worker-3" });
  const healthServer = startHealthServer();
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    workerReady = false;
    logger.info({ signal }, "worker shutting down gracefully");
    healthServer.close();
    await consumer?.stop();
    await consumer?.disconnect();
    await prisma.$disconnect();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  await consumer.connect();
  consumer.on(consumer.events.GROUP_JOIN, () => {
    workerReady = true;
  });
  consumer.on(consumer.events.DISCONNECT, () => {
    workerReady = false;
  });
  await consumer.subscribe({ topic: "zap-events", fromBeginning: true });
  logger.info(
    { workerId: config.WORKER_ID, concurrency: config.WORKER_CONCURRENCY },
    "worker started",
  );
  await consumer.run({
    autoCommit: false,
    partitionsConsumedConcurrently: config.WORKER_CONCURRENCY,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      if (!raw) throw new Error("Queue message has no value");
      const { zapRunId, stage } = eventSchema.parse(JSON.parse(raw));
      await processEvent(zapRunId, stage);
      await consumer!.commitOffsets([
        { topic, partition, offset: String(Number(message.offset) + 1) },
      ]);
    },
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker stopped unexpectedly");
  process.exit(1);
});
