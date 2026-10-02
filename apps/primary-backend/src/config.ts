import { z } from "zod";

const localSecret = "local-only-secret-change-before-production-32chars";
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  DATABASE_URL: z.string().min(1),
  JWT_PASSWORD: z.string().min(32).optional(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  APP_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_ENDPOINT: z.string().default("mailpit"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().default("no-reply@flowforge.local"),
  SOLANA_WALLET_ENCRYPTION_KEY: z.string().min(32).optional(),
  CONNECTION_ENCRYPTION_KEY: z.string().min(32).optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
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
if (appEnvironment === "production" && !parsed.data.CONNECTION_ENCRYPTION_KEY)
  throw new Error(
    "CONNECTION_ENCRYPTION_KEY is required in production and must contain at least 32 characters",
  );
if (
  appEnvironment === "production" &&
  !parsed.data.SOLANA_WALLET_ENCRYPTION_KEY
)
  throw new Error(
    "SOLANA_WALLET_ENCRYPTION_KEY is required in production and must contain at least 32 characters",
  );
if (
  appEnvironment === "production" &&
  new Set([
    parsed.data.JWT_PASSWORD,
    parsed.data.CONNECTION_ENCRYPTION_KEY,
    parsed.data.SOLANA_WALLET_ENCRYPTION_KEY,
  ]).size !== 3
)
  throw new Error(
    "JWT_PASSWORD and encryption keys must use independent values in production",
  );
if (
  appEnvironment === "production" &&
  new URL(parsed.data.APP_PUBLIC_URL).protocol !== "https:"
)
  throw new Error("APP_PUBLIC_URL must use HTTPS in production");
if (
  appEnvironment === "production" &&
  parsed.data.CORS_ORIGINS.split(",").some(
    (origin) => new URL(origin.trim()).protocol !== "https:",
  )
)
  throw new Error("Every CORS_ORIGINS entry must use HTTPS in production");
for (const [provider, clientId, clientSecret] of [
  ["Slack", parsed.data.SLACK_CLIENT_ID, parsed.data.SLACK_CLIENT_SECRET],
  ["Google", parsed.data.GOOGLE_CLIENT_ID, parsed.data.GOOGLE_CLIENT_SECRET],
] as const)
  if (Boolean(clientId) !== Boolean(clientSecret))
    throw new Error(
      `${provider} OAuth requires both a client ID and client secret`,
    );

export const config = {
  ...parsed.data,
  APP_ENV: appEnvironment,
  JWT_PASSWORD: parsed.data.JWT_PASSWORD ?? localSecret,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  COOKIE_SECURE: appEnvironment === "production",
  APP_PUBLIC_URL: parsed.data.APP_PUBLIC_URL.replace(/\/$/, ""),
  SOLANA_WALLET_ENCRYPTION_KEY:
    parsed.data.SOLANA_WALLET_ENCRYPTION_KEY ??
    "local-devnet-wallet-encryption-key-change-me",
  CONNECTION_ENCRYPTION_KEY:
    parsed.data.CONNECTION_ENCRYPTION_KEY ??
    "local-connection-encryption-key-change-me",
};
