import prisma from "@repo/db/client";
import { Kafka } from "kafkajs";
import pino from "pino";
import { z } from "zod";
type OutboxRow = { id: string; zapRunId: string };

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

async function main() {
  const producer = kafka.producer();
  await producer.connect();
  logger.info("sweeper started");
  for (;;) {
    const pendingRows = await prisma.zapRunOutbox.findMany({
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    if (pendingRows.length) {
      await producer.send({
        topic: "zap-events",
        messages: pendingRows.map((row: OutboxRow) => ({
          key: row.zapRunId,
          value: JSON.stringify({ zapRunId: row.zapRunId, stage: 0 }),
        })),
      });
      await prisma.zapRunOutbox.deleteMany({
        where: { id: { in: pendingRows.map((row: OutboxRow) => row.id) } },
      });
      logger.info({ count: pendingRows.length }, "outbox batch published");
    }
    await new Promise((resolve) =>
      setTimeout(resolve, config.SWEEP_INTERVAL_MS),
    );
  }
}

main().catch((error) => {
  logger.fatal({ err: error }, "sweeper stopped unexpectedly");
  process.exitCode = 1;
});
