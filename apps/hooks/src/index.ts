import { randomUUID } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { z, ZodError } from "zod";
import prisma from "@repo/db/client";
import type { Prisma } from "@prisma/client";

const environment = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1),
    WEBHOOK_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i)
      .default("256kb"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .parse(process.env);

const logger = pino({
  level: environment.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body",
      "token",
    ],
    censor: "[REDACTED]",
  },
});
const routeParams = z.object({
  zapId: z.string().uuid(),
  token: z.string().uuid(),
});
const idempotencyHeader = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7E]+$/);

export const app = express();
app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    genReqId: (req) =>
      typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"].slice(0, 128)
        : randomUUID(),
  }),
);
app.use((req, res, next) => {
  res.setHeader("x-request-id", String(req.id));
  next();
});
app.use(helmet());
app.use(
  express.json({
    limit: environment.WEBHOOK_BODY_LIMIT,
    strict: true,
    type: ["application/json", "application/*+json"],
  }),
);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "hooks" });
});

const webhookHandler: RequestHandler = (req, res, next) => {
  void (async () => {
    const { zapId, token } = routeParams.parse(req.params);
    const header = req.header("idempotency-key");
    const idempotencyKey = header ? idempotencyHeader.parse(header) : undefined;
    const body = z.record(z.string(), z.unknown()).parse(req.body);
    const zap = await prisma.zap.findFirst({
      where: { id: zapId, webhookToken: token },
      select: { id: true },
    });
    if (!zap) {
      res.status(404).json({
        error: {
          code: "WEBHOOK_NOT_FOUND",
          message: "Webhook workflow not found",
        },
        requestId: req.id,
      });
      return;
    }
    let duplicate = false;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const run = await tx.zapRun.create({
          data: {
            zapId,
            metadata: body as Prisma.InputJsonValue,
            idempotencyKey,
          },
        });
        await tx.zapRunOutbox.create({ data: { zapRunId: run.id } });
      });
    } catch (error: any) {
      if (idempotencyKey && error?.code === "P2002") duplicate = true;
      else throw error;
    }
    res.status(duplicate ? 200 : 202).json({
      message: duplicate ? "Webhook already accepted" : "Webhook accepted",
      duplicate,
    });
  })().catch(next);
};
app.post("/hooks/catch/:zapId/:token", webhookHandler);

const missingRoute: RequestHandler = (_req, res) => {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
};
app.use(missingRoute);
const handleError: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
      },
      requestId: req.id,
    });
    return;
  }
  if ((error as any)?.type === "entity.too.large") {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Webhook payload exceeds the configured limit",
      },
      requestId: req.id,
    });
    return;
  }
  logger.error({ err: error, requestId: req.id }, "webhook request failed");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
    requestId: req.id,
  });
};
app.use(handleError);

if (process.env.NODE_ENV !== "test")
  app.listen(environment.PORT, () =>
    logger.info({ port: environment.PORT }, "hooks service started"),
  );
