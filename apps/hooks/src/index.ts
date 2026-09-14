import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type Request,
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
const signatureHeader = z.string().regex(/^sha256=[a-f0-9]{64}$/i);

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

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
    verify: (req, _res, buffer) => {
      (req as Request).rawBody = Buffer.from(buffer);
    },
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

function sendWebhookError(
  res: Parameters<RequestHandler>[1],
  requestId: unknown,
  status: number,
  code: string,
  message: string,
) {
  res.status(status).json({ error: { code, message }, requestId });
}

function hasValidSignature(
  rawBody: Buffer,
  secret: string,
  suppliedHeader: string | undefined,
) {
  if (!suppliedHeader) return false;
  const supplied = signatureHeader.safeParse(suppliedHeader);
  if (!supplied.success) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied.data);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

const webhookHandler: RequestHandler = (req, res, next) => {
  void (async () => {
    const { zapId, token } = routeParams.parse(req.params);
    const header = req.header("idempotency-key");
    const idempotencyKey = header ? idempotencyHeader.parse(header) : undefined;
    const body = z.record(z.string(), z.unknown()).parse(req.body);
    const zap = await prisma.zap.findFirst({
      where: { id: zapId, webhookToken: token },
      select: {
        id: true,
        status: true,
        publishedVersion: true,
        webhookSecret: true,
        requireSignature: true,
      },
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
    if (zap.status !== "PUBLISHED" || !zap.publishedVersion) {
      sendWebhookError(
        res,
        req.id,
        409,
        zap.status === "PAUSED" ? "WORKFLOW_PAUSED" : "WORKFLOW_NOT_PUBLISHED",
        zap.status === "PAUSED"
          ? "Workflow is paused"
          : "Workflow is not published",
      );
      return;
    }
    if (
      zap.requireSignature &&
      !hasValidSignature(
        req.rawBody ?? Buffer.alloc(0),
        zap.webhookSecret,
        req.header("x-flowforge-signature"),
      )
    ) {
      sendWebhookError(
        res,
        req.id,
        401,
        "INVALID_WEBHOOK_SIGNATURE",
        "Webhook signature is missing or invalid",
      );
      return;
    }
    const version = await prisma.workflowVersion.findUnique({
      where: {
        zapId_version: { zapId, version: zap.publishedVersion },
      },
    });
    if (!version) throw new Error("Published workflow version was not found");
    let duplicate = false;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const run = await tx.zapRun.create({
          data: {
            zapId,
            metadata: body as Prisma.InputJsonValue,
            idempotencyKey,
            workflowVersionId: version.id,
            definitionSnapshot: version.definition as Prisma.InputJsonValue,
          },
        });
        await tx.zapRunOutbox.create({ data: { zapRunId: run.id } });
      });
    } catch (error: unknown) {
      if (idempotencyKey && (error as { code?: string })?.code === "P2002")
        duplicate = true;
      else throw error;
    }
    res.status(duplicate ? 200 : 202).json({
      message: duplicate ? "Webhook already accepted" : "Webhook accepted",
      duplicate,
    });
  })().catch(next);
};
app.post("/hooks/catch/:zapId/:token", webhookHandler);

app.post("/hooks/test/:zapId/:token", (req, res, next) => {
  void (async () => {
    const { zapId, token } = routeParams.parse(req.params);
    const body = z.record(z.string(), z.unknown()).parse(req.body);
    const zap = await prisma.zap.findFirst({
      where: { id: zapId, webhookToken: token, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        webhookSecret: true,
        requireSignature: true,
      },
    });
    if (!zap) {
      sendWebhookError(
        res,
        req.id,
        404,
        "WEBHOOK_NOT_FOUND",
        "Webhook workflow not found",
      );
      return;
    }
    if (
      zap.requireSignature &&
      !hasValidSignature(
        req.rawBody ?? Buffer.alloc(0),
        zap.webhookSecret,
        req.header("x-flowforge-signature"),
      )
    ) {
      sendWebhookError(
        res,
        req.id,
        401,
        "INVALID_WEBHOOK_SIGNATURE",
        "Webhook signature is missing or invalid",
      );
      return;
    }
    const capture = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.testTriggerCapture.deleteMany({
          where: { zapId, expiresAt: { lt: new Date() } },
        });
        return tx.testTriggerCapture.create({
          data: {
            zapId,
            payload: body as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        });
      },
    );
    res
      .status(202)
      .json({ message: "Test payload captured", captureId: capture.id });
  })().catch(next);
});

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
  if ((error as { type?: string })?.type === "entity.too.large") {
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
