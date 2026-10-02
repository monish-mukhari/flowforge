import type { AppConnection, Prisma } from "@prisma/client";
import prisma from "./index";
import {
  decryptConnectionCredentials,
  encryptConnectionCredentials,
} from "./connection-crypto";

export type OAuthConnectorKey = "slack" | "google-sheets";

export type OAuthClients = {
  slack?: { clientId: string; clientSecret: string };
  google?: { clientId: string; clientSecret: string };
};

export class ConnectionTokenError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly revoked = false,
  ) {
    super(message);
  }
}

type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; message: string; code: string; revoked: boolean };

function refreshRequest(
  connectorKey: OAuthConnectorKey,
  refreshToken: string,
  clients: OAuthClients,
): { url: string; headers: Record<string, string>; body: URLSearchParams } {
  if (connectorKey === "google-sheets") {
    const client = clients.google;
    if (!client)
      throw new ConnectionTokenError(
        "Google OAuth refresh is not configured",
        "OAUTH_NOT_CONFIGURED",
      );
    return {
      url: "https://oauth2.googleapis.com/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    };
  }

  const client = clients.slack;
  if (!client)
    throw new ConnectionTokenError(
      "Slack OAuth refresh is not configured",
      "OAUTH_NOT_CONFIGURED",
    );
  return {
    url: "https://slack.com/api/oauth.v2.access",
    headers: {
      authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  };
}

export function isRevokedOAuthError(
  connectorKey: OAuthConnectorKey,
  status: number,
  body: Record<string, unknown>,
) {
  const providerCode = String(body.error ?? "");
  if (connectorKey === "google-sheets")
    return status === 401 || providerCode === "invalid_grant";
  return [
    "account_inactive",
    "invalid_auth",
    "invalid_refresh_token",
    "token_expired",
    "token_revoked",
  ].includes(providerCode);
}

function oauthClientsFromEnvironment(): OAuthClients {
  return {
    ...(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET
      ? {
          slack: {
            clientId: process.env.SLACK_CLIENT_ID,
            clientSecret: process.env.SLACK_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  };
}

/**
 * Refreshes under a PostgreSQL row lock. This is intentionally shared by the
 * API and workers because Slack refresh tokens rotate and can only be used
 * once; the lock prevents two processes from consuming the same token.
 */
export async function getConnectionAccessToken(input: {
  connectionId: string;
  connectorKey: OAuthConnectorKey;
  userId?: number;
  clients?: OAuthClients;
  fetchImpl?: typeof fetch;
  refreshSkewMs?: number;
}) {
  const clients = input.clients ?? oauthClientsFromEnvironment();
  const fetchImpl = input.fetchImpl ?? fetch;
  const result = await prisma.$transaction(
    async (tx): Promise<TokenResult> => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AppConnection"
        WHERE "id" = ${input.connectionId}
        FOR UPDATE
      `;
      if (!locked.length)
        return {
          ok: false,
          message: `Active ${input.connectorKey} connection not found`,
          code: "CONNECTION_NOT_FOUND",
          revoked: false,
        };

      const connection = await tx.appConnection.findFirst({
        where: {
          id: input.connectionId,
          connectorKey: input.connectorKey,
          status: { not: "REVOKED" },
          ...(input.userId === undefined ? {} : { userId: input.userId }),
        },
      });
      if (!connection)
        return {
          ok: false,
          message: `Active ${input.connectorKey} connection not found`,
          code: "CONNECTION_NOT_FOUND",
          revoked: true,
        };

      const credentials = decryptConnectionCredentials(
        connection.encryptedCredentials,
      );
      const customClientId = String(credentials.oauthClientId ?? "");
      const customClientSecret = String(credentials.oauthClientSecret ?? "");
      const connectionClients =
        customClientId && customClientSecret
          ? {
              ...clients,
              ...(input.connectorKey === "slack"
                ? {
                    slack: {
                      clientId: customClientId,
                      clientSecret: customClientSecret,
                    },
                  }
                : {
                    google: {
                      clientId: customClientId,
                      clientSecret: customClientSecret,
                    },
                  }),
            }
          : clients;
      const current = String(credentials.accessToken ?? "");
      if (!current)
        return connectionFailure(
          tx,
          connection,
          "Connection has no access token",
          "ACCESS_TOKEN_MISSING",
          false,
        );
      if (
        !connection.expiresAt ||
        connection.expiresAt.getTime() >
          Date.now() + (input.refreshSkewMs ?? 60_000)
      )
        return { ok: true, accessToken: current };

      const refreshToken = String(credentials.refreshToken ?? "");
      if (!refreshToken)
        return connectionFailure(
          tx,
          connection,
          "Connection has expired and cannot be refreshed",
          "REFRESH_TOKEN_MISSING",
          true,
        );

      let request: ReturnType<typeof refreshRequest>;
      try {
        request = refreshRequest(
          input.connectorKey,
          refreshToken,
          connectionClients,
        );
      } catch (error) {
        const tokenError = error as ConnectionTokenError;
        return connectionFailure(
          tx,
          connection,
          tokenError.message,
          tokenError.code,
          false,
        );
      }

      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const nextAccessToken =
        typeof body.access_token === "string" ? body.access_token : "";
      const succeeded =
        response.ok &&
        Boolean(nextAccessToken) &&
        (input.connectorKey !== "slack" || body.ok === true);
      if (!succeeded) {
        const revoked = isRevokedOAuthError(
          input.connectorKey,
          response.status,
          body,
        );
        return connectionFailure(
          tx,
          connection,
          `${input.connectorKey} token refresh failed`,
          String(body.error ?? `HTTP_${response.status}`),
          revoked,
        );
      }

      await tx.appConnection.update({
        where: { id: connection.id },
        data: {
          encryptedCredentials: encryptConnectionCredentials({
            ...credentials,
            accessToken: nextAccessToken,
            refreshToken: body.refresh_token ?? refreshToken,
          }),
          expiresAt:
            typeof body.expires_in === "number"
              ? new Date(Date.now() + body.expires_in * 1000)
              : null,
          status: "ACTIVE",
          lastError: null,
        },
      });
      return { ok: true, accessToken: nextAccessToken };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  if (!result.ok)
    throw new ConnectionTokenError(result.message, result.code, result.revoked);
  return result.accessToken;
}

async function connectionFailure(
  tx: Prisma.TransactionClient,
  connection: AppConnection,
  message: string,
  code: string,
  revoked: boolean,
): Promise<TokenResult> {
  await tx.appConnection.update({
    where: { id: connection.id },
    data: {
      status: revoked ? "REVOKED" : "ERROR",
      lastError: message,
    },
  });
  return { ok: false, message, code, revoked };
}

export async function revokeProviderAccess(
  connectorKey: OAuthConnectorKey,
  encryptedCredentials: string,
  fetchImpl: typeof fetch = fetch,
) {
  const credentials = decryptConnectionCredentials(encryptedCredentials);
  const token = String(
    connectorKey === "slack"
      ? (credentials.accessToken ?? "")
      : (credentials.refreshToken ?? credentials.accessToken ?? ""),
  );
  if (!token) return;
  const response =
    connectorKey === "slack"
      ? await fetchImpl("https://slack.com/api/auth.revoke", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        })
      : await fetchImpl("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
  if (
    !response.ok &&
    !(connectorKey === "google-sheets" && response.status === 400)
  )
    throw new Error(`${connectorKey} rejected token revocation`);
  if (connectorKey === "slack") {
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      body.ok !== true &&
      !isRevokedOAuthError("slack", response.status, body)
    )
      throw new Error("Slack rejected token revocation");
  }
}
