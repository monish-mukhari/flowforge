import { z } from "zod";

const localSecret = "local-only-secret-change-before-production-32chars";
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  DATABASE_URL: z.string().min(1),
  JWT_PASSWORD: z.string().min(32).optional(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  APP_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  SMTP_ENDPOINT: z.string().default("mailpit"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().default("no-reply@flowforge.local"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
  );
const appEnvironment =
  parsed.data.APP_ENV ?? parsed.data.NODE_ENV ?? "development";
if (appEnvironment === "production" && !parsed.data.JWT_PASSWORD)
  throw new Error(
    "JWT_PASSWORD is required in production and must contain at least 32 characters",
  );

export const config = {
  ...parsed.data,
  APP_ENV: appEnvironment,
  JWT_PASSWORD: parsed.data.JWT_PASSWORD ?? localSecret,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  COOKIE_SECURE: appEnvironment === "production",
};
