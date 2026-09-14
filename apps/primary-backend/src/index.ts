import express from "express";
import { zapRouter } from "./router/zap";
import { userRouter } from "./router/user";
import cors from "cors";
import { actionRouter } from "./router/action";
import { triggerRouter } from "./router/trigger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./errors";
import { logger } from "./logger";
import { openApiDocument } from "./openapi";

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
  cors({
    origin(origin, callback) {
      callback(null, !origin || config.CORS_ORIGINS.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  }),
);
app.use(express.json({ limit: "256kb", strict: true }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "primary-backend" });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

app.use(
  "/api/v1/user",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  userRouter,
);

app.use("/api/v1/zap", zapRouter);

app.use("/api/v1/action", actionRouter);

app.use("/api/v1/trigger", triggerRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const port = config.PORT;
if (process.env.NODE_ENV !== "test")
  app.listen(port, () => logger.info({ port }, "primary backend started"));
