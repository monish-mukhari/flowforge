import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@repo/db/client";
import {
  decryptConnectionCredentials,
  encryptConnectionCredentials,
} from "@repo/db/connection-crypto";
import {
  ConnectionTokenError,
  getConnectionAccessToken,
  isRevokedOAuthError,
  revokeProviderAccess,
} from "@repo/db/connection-oauth";
import { config } from "../config";
import { asyncRoute, HttpError } from "../errors";
import { authMiddleware } from "../middleware";
import {
  connectorContract,
  connectorRegistry,
  publicConnectorContract,
} from "../connectors/registry";
import { logger } from "../logger";

const router = Router();
const idSchema = z.object({ connectionId: z.string().uuid() });
const createSchema = z.discriminatedUnion("connectorKey", [
  z.object({
    connectorKey: z.literal("email"),
    name: z.string().trim().min(1).max(120),
    credentials: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number().int().min(1).max(65535),
      secure: z.boolean().default(false),
      username: z.string().max(255).optional(),
      password: z.string().max(1000).optional(),
      from: z.string().email().max(254),
    }),
  }),
  z.object({
    connectorKey: z.literal("http"),
    name: z.string().trim().min(1).max(120),
    credentials: z.object({
      authType: z.enum(["NONE", "BEARER", "API_KEY", "BASIC"]),
      token: z.string().max(4000).optional(),
      headerName: z
        .string()
        .regex(/^[A-Za-z0-9-]+$/)
        .max(100)
        .optional(),
      apiKey: z.string().max(4000).optional(),
      username: z.string().max(1000).optional(),
      password: z.string().max(4000).optional(),
    }),
  }),
]);
const providerSchema = z.object({
  provider: z.enum(["slack", "google-sheets"]),
});
const callbackSchema = z.object({
  state: z.string().min(32),
  code: z.string().min(1).optional(),
  error: z.string().optional(),
});

function hashState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function callbackUrl(provider: string) {
  return `${config.APP_PUBLIC_URL}/api/v1/connections/oauth/${provider}/callback`;
}

function publicConnection<T extends { encryptedCredentials: string }>(
  connection: T,
) {
  const { encryptedCredentials: _secret, ...safe } = connection;
  return safe;
}

async function exchangeSlack(code: string) {
  if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET)
    throw new HttpError(
      503,
      "OAUTH_NOT_CONFIGURED",
      "Slack OAuth is not configured",
    );
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.SLACK_CLIENT_ID}:${config.SLACK_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ code, redirect_uri: callbackUrl("slack") }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || body.ok !== true || typeof body.access_token !== "string")
    throw new HttpError(
      400,
      "OAUTH_EXCHANGE_FAILED",
      `Slack rejected the authorization code: ${String(body.error ?? response.status)}`,
    );
  const team = body.team as { id?: string; name?: string } | undefined;
  return {
    credentials: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      tokenType: body.token_type,
    },
    externalAccountId: team?.id,
    externalAccountName: team?.name ?? "Slack workspace",
    scopes: String(body.scope ?? "")
      .split(",")
      .filter(Boolean),
    expiresAt:
      typeof body.expires_in === "number"
        ? new Date(Date.now() + body.expires_in * 1000)
        : null,
  };
}

async function exchangeGoogle(code: string, codeVerifier: string) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)
    throw new HttpError(
      503,
      "OAUTH_NOT_CONFIGURED",
      "Google OAuth is not configured",
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl("google-sheets"),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string")
    throw new HttpError(
      400,
      "OAUTH_EXCHANGE_FAILED",
      "Google rejected the authorization code",
    );
  const profileResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { authorization: `Bearer ${body.access_token}` },
    },
  );
  const profile = profileResponse.ok
    ? ((await profileResponse.json()) as Record<string, unknown>)
    : {};
  return {
    credentials: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      tokenType: body.token_type,
    },
    externalAccountId:
      typeof profile.sub === "string" ? profile.sub : undefined,
    externalAccountName:
      typeof profile.email === "string" ? profile.email : "Google account",
    scopes: String(body.scope ?? "")
      .split(" ")
      .filter(Boolean),
    expiresAt:
      typeof body.expires_in === "number"
        ? new Date(Date.now() + body.expires_in * 1000)
        : null,
  };
}

async function testConnection(connection: {
  id: string;
  userId: number;
  connectorKey: string;
  encryptedCredentials: string;
}) {
  const credentials = decryptConnectionCredentials(
    connection.encryptedCredentials,
  );
  if (connection.connectorKey === "email") {
    const transport = nodemailer.createTransport({
      host: String(credentials.host),
      port: Number(credentials.port),
      secure: Boolean(credentials.secure),
      auth: credentials.username
        ? {
            user: String(credentials.username),
            pass: String(credentials.password ?? ""),
          }
        : undefined,
    });
    await transport.verify();
    return;
  }
  if (connection.connectorKey === "http") return;
  const connectorKey = connection.connectorKey as "slack" | "google-sheets";
  const accessToken = await getConnectionAccessToken({
    connectionId: connection.id,
    connectorKey,
    userId: connection.userId,
    clients: {
      ...(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET
        ? {
            slack: {
              clientId: config.SLACK_CLIENT_ID,
              clientSecret: config.SLACK_CLIENT_SECRET,
            },
          }
        : {}),
      ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
  });
  const target =
    connection.connectorKey === "slack"
      ? "https://slack.com/api/auth.test"
      : "https://www.googleapis.com/oauth2/v3/userinfo";
  const response = await fetch(target, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || (connection.connectorKey === "slack" && body.ok !== true))
    throw new ConnectionTokenError(
      `${connection.connectorKey} connection test failed`,
      String(body.error ?? `HTTP_${response.status}`),
      isRevokedOAuthError(connectorKey, response.status, body),
    );
}

router.get(
  "/catalog",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    res.json({ connectors: connectorRegistry.map(publicConnectorContract) });
  }),
);

router.get(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const connections = await prisma.appConnection.findMany({
      where: {
        OR: [
          { userId: req.userId! },
          { organization: { members: { some: { userId: req.userId! } } } },
        ],
      },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json({
      connections: connections.map((connection) => ({
        ...publicConnection(connection),
        owned: connection.userId === req.userId!,
      })),
    });
  }),
);

router.post(
  "/:connectionId/share",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { connectionId } = idSchema.parse(req.params);
    const input = z
      .object({ organizationId: z.string().uuid() })
      .parse(req.body);
    const connection = await prisma.appConnection.findFirst({
      where: { id: connectionId, userId: req.userId! },
    });
    if (!connection)
      throw new HttpError(404, "CONNECTION_NOT_FOUND", "Connection not found");
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: req.userId!,
        },
      },
    });
    if (!member || !["OWNER", "ADMIN"].includes(member.role))
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Owner or admin access is required to share connections",
      );
    const updated = await prisma.appConnection.update({
      where: { id: connectionId },
      data: { organizationId: input.organizationId },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: req.userId!,
        action: "connection.shared",
        resourceType: "connection",
        resourceId: connectionId,
      },
    });
    res.json({ connection: publicConnection(updated) });
  }),
);

router.post(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const input = createSchema.parse(req.body);
    const connection = await prisma.appConnection.create({
      data: {
        userId: req.userId!,
        connectorKey: input.connectorKey,
        name: input.name,
        encryptedCredentials: encryptConnectionCredentials(input.credentials),
      },
    });
    res.status(201).json({ connection: publicConnection(connection) });
  }),
);

router.post(
  "/:connectionId/test",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { connectionId } = idSchema.parse(req.params);
    const connection = await prisma.appConnection.findFirst({
      where: { id: connectionId, userId: req.userId! },
    });
    if (!connection)
      throw new HttpError(404, "CONNECTION_NOT_FOUND", "Connection not found");
    try {
      await testConnection(connection);
      const updated = await prisma.appConnection.update({
        where: { id: connection.id },
        data: { status: "ACTIVE", lastTestedAt: new Date(), lastError: null },
      });
      res.json({ connection: publicConnection(updated) });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection test failed";
      await prisma.appConnection.update({
        where: { id: connection.id },
        data: {
          status:
            error instanceof ConnectionTokenError && error.revoked
              ? "REVOKED"
              : "ERROR",
          lastTestedAt: new Date(),
          lastError: message,
        },
      });
      throw new HttpError(400, "CONNECTION_TEST_FAILED", message);
    }
  }),
);

router.delete(
  "/:connectionId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { connectionId } = idSchema.parse(req.params);
    const connection = await prisma.appConnection.findFirst({
      where: { id: connectionId, userId: req.userId! },
    });
    if (!connection)
      throw new HttpError(404, "CONNECTION_NOT_FOUND", "Connection not found");
    if (["slack", "google-sheets"].includes(connection.connectorKey))
      try {
        await revokeProviderAccess(
          connection.connectorKey as "slack" | "google-sheets",
          connection.encryptedCredentials,
        );
      } catch (error) {
        logger.warn(
          { err: error, connectionId, connectorKey: connection.connectorKey },
          "provider token revocation failed; removing local credentials",
        );
      }
    await prisma.appConnection.delete({ where: { id: connection.id } });
    res.status(204).send();
  }),
);

router.post(
  "/oauth/:provider/start",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { provider } = providerSchema.parse(req.params);
    const definition = connectorContract(provider);
    if (!definition?.oauthProvider)
      throw new HttpError(
        400,
        "OAUTH_NOT_SUPPORTED",
        "Connector does not support OAuth",
      );
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    await prisma.oAuthState.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await prisma.oAuthState.create({
      data: {
        userId: req.userId!,
        connectorKey: provider,
        tokenHash: hashState(state),
        codeVerifier: provider === "google-sheets" ? verifier : null,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    let authorizationUrl: URL;
    if (provider === "slack") {
      if (!config.SLACK_CLIENT_ID)
        throw new HttpError(
          503,
          "OAUTH_NOT_CONFIGURED",
          "Slack OAuth is not configured",
        );
      authorizationUrl = new URL("https://slack.com/oauth/v2/authorize");
      authorizationUrl.search = new URLSearchParams({
        client_id: config.SLACK_CLIENT_ID,
        scope: "chat:write",
        redirect_uri: callbackUrl(provider),
        state,
      }).toString();
    } else {
      if (!config.GOOGLE_CLIENT_ID)
        throw new HttpError(
          503,
          "OAUTH_NOT_CONFIGURED",
          "Google OAuth is not configured",
        );
      authorizationUrl = new URL(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      authorizationUrl.search = new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        redirect_uri: callbackUrl(provider),
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        scope: "openid email https://www.googleapis.com/auth/spreadsheets",
        state,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
      }).toString();
    }
    res.json({ authorizationUrl: authorizationUrl.toString() });
  }),
);

router.get(
  "/oauth/:provider/callback",
  asyncRoute(async (req, res) => {
    const { provider } = providerSchema.parse(req.params);
    const query = callbackSchema.parse(req.query);
    const state = await prisma.oAuthState.findUnique({
      where: { tokenHash: hashState(query.state) },
    });
    if (
      !state ||
      state.connectorKey !== provider ||
      state.expiresAt <= new Date()
    )
      throw new HttpError(
        400,
        "INVALID_OAUTH_STATE",
        "OAuth state is invalid or expired",
      );
    await prisma.oAuthState.delete({ where: { id: state.id } });
    if (query.error || !query.code)
      return res.redirect(
        `${config.APP_PUBLIC_URL}/connections?error=${encodeURIComponent(query.error ?? "authorization_denied")}`,
      );
    try {
      const exchanged =
        provider === "slack"
          ? await exchangeSlack(query.code)
          : await exchangeGoogle(query.code, state.codeVerifier ?? "");
      await prisma.appConnection.create({
        data: {
          userId: state.userId,
          connectorKey: provider,
          name: exchanged.externalAccountName,
          encryptedCredentials: encryptConnectionCredentials(
            exchanged.credentials,
          ),
          externalAccountId: exchanged.externalAccountId,
          externalAccountName: exchanged.externalAccountName,
          scopes: exchanged.scopes as Prisma.InputJsonValue,
          expiresAt: exchanged.expiresAt,
        },
      });
    } catch (error) {
      logger.warn({ err: error, provider }, "OAuth callback failed");
      return res.redirect(
        `${config.APP_PUBLIC_URL}/connections?error=oauth_exchange_failed`,
      );
    }
    return res.redirect(
      `${config.APP_PUBLIC_URL}/connections?connected=${provider}`,
    );
  }),
);

export const connectionRouter = router;
