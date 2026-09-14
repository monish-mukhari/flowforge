import prisma from "@repo/db/client";
import { Kafka } from "kafkajs";
import pino from "pino";
import { z } from "zod";

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
  logger.info("sweeper started");
  let sweepCount = 0;
  while (!stopping) {
    await recoverExpiredLeases();
    await publishAvailable(producer);
    if (sweepCount++ % 20 === 0) await logQueueHealth();
    await new Promise((resolve) =>
      setTimeout(resolve, config.SWEEP_INTERVAL_MS),
    );
  }
  await producer.disconnect();
  await prisma.$disconnect();
}

main().catch((error) => {
  logger.fatal({ err: error }, "sweeper stopped unexpectedly");
  process.exitCode = 1;
});
