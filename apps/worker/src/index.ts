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
import { sendEmail } from "./email";
import {
  executionErrorMessage,
  retryDelayMs,
  shouldRetry,
} from "./execution-policy";

const config = z
  .object({
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
  })
  .parse(process.env);

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
      zapRun: { select: { metadata: true, status: true, startedAt: true } },
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
  const runMetadata = metadataSchema.parse(step.zapRun.metadata);
  if (step.actionType === "email") {
    const result = await sendEmail(
      parse(String(actionMetadata.email ?? ""), runMetadata),
      parse(String(actionMetadata.body ?? ""), runMetadata),
      step.idempotencyKey,
    );
    return { messageId: result.messageId, accepted: result.accepted.length };
  }
  if (step.actionType === "solana") {
    const signature = await sendSol(
      parse(String(actionMetadata.address ?? ""), runMetadata),
      parse(String(actionMetadata.amount ?? ""), runMetadata),
    );
    return { signature };
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
    await failStep(step, error);
  } finally {
    clearInterval(heartbeat);
  }
}

function startHealthServer() {
  return createServer(async (req, res) => {
    if (req.url !== "/health" && req.url !== "/metrics") {
      res.writeHead(404).end();
      return;
    }
    try {
      const [queued, running, deadLetter, retryScheduled] = await Promise.all([
        prisma.zapRun.count({ where: { status: "QUEUED" } }),
        prisma.zapRun.count({ where: { status: "RUNNING" } }),
        prisma.zapRun.count({ where: { status: "DEAD_LETTER" } }),
        prisma.zapRunStep.count({ where: { status: "RETRY_SCHEDULED" } }),
      ]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: shuttingDown ? "stopping" : "ok",
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
    logger.info({ signal }, "worker shutting down gracefully");
    healthServer.close();
    await consumer?.stop();
    await consumer?.disconnect();
    await prisma.$disconnect();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  await consumer.connect();
  await consumer.subscribe({ topic: "zap-events" });
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
  process.exitCode = 1;
});
