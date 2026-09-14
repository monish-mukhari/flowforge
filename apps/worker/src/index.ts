import "dotenv/config";
import { Kafka } from "kafkajs";
import prisma from "@repo/db/client";
import pino from "pino";
import { z } from "zod";
import { parse } from "./parser";
import { sendSol } from "./solana";
import { sendEmail } from "./email";

const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    KAFKA_BROKERS: z.string().min(1),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .parse(process.env);
const eventSchema = z
  .object({
    zapRunId: z.string().uuid(),
    stage: z.number().int().min(0).max(100),
  })
  .strict();
const workflowSnapshotSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable().optional(),
    trigger: z.object({
      availableTriggerId: z.string(),
      triggerMetadata: z.record(z.string(), z.unknown()).optional(),
    }),
    actions: z.array(
      z.object({
        availableActionId: z.string(),
        actionMetadata: z.record(z.string(), z.unknown()),
        sortingOrder: z.number().int().min(0),
      }),
    ),
  })
  .strict();
const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ["email", "body", "address", "metadata"],
    censor: "[REDACTED]",
  },
});
const kafka = new Kafka({
  clientId: "worker",
  brokers: config.KAFKA_BROKERS.split(",").map((value) => value.trim()),
});

async function main() {
  const consumer = kafka.consumer({ groupId: "main-worker-2" });
  const producer = kafka.producer();
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: "zap-events" });
  logger.info("worker started");
  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      if (!raw) throw new Error("Queue message has no value");
      const { zapRunId, stage } = eventSchema.parse(JSON.parse(raw));
      const run = await prisma.zapRun.findUnique({
        where: { id: zapRunId },
        select: {
          metadata: true,
          definitionSnapshot: true,
        },
      });
      if (!run) throw new Error(`Run not found: ${zapRunId}`);
      const snapshot = workflowSnapshotSchema.parse(run.definitionSnapshot);
      const action = snapshot.actions.find(
        (item) => item.sortingOrder === stage,
      );
      if (!action) throw new Error(`Action stage not found: ${stage}`);
      const metadata = action.actionMetadata;
      if (action.availableActionId === "email")
        await sendEmail(
          parse(String(metadata.email ?? ""), run.metadata),
          parse(String(metadata.body ?? ""), run.metadata),
        );
      else if (action.availableActionId === "solana")
        await sendSol(
          parse(String(metadata.address ?? ""), run.metadata),
          parse(String(metadata.amount ?? ""), run.metadata),
        );
      else
        throw new Error(`Unsupported action type: ${action.availableActionId}`);
      if (stage < snapshot.actions.length - 1)
        await producer.send({
          topic: "zap-events",
          messages: [
            {
              key: zapRunId,
              value: JSON.stringify({ stage: stage + 1, zapRunId }),
            },
          ],
        });
      await consumer.commitOffsets([
        { topic, partition, offset: String(Number(message.offset) + 1) },
      ]);
      logger.info(
        { zapRunId, stage, actionType: action.availableActionId },
        "workflow stage processed",
      );
    },
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker stopped unexpectedly");
  process.exitCode = 1;
});
