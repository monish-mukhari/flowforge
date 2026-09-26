import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AppConnection } from "@prisma/client";
import prisma from "@repo/db/client";
import {
  decryptConnectionCredentials,
  encryptConnectionCredentials,
} from "@repo/db/connection-crypto";
import { z } from "zod";
import { parse } from "./parser";
import { sendEmail } from "./email";

const objectSchema = z.record(z.string(), z.unknown());

async function ownedConnection(
  connectionId: string,
  userId: number,
  connectorKey: string,
) {
  const connection = await prisma.appConnection.findFirst({
    where: {
      id: connectionId,
      userId,
      connectorKey,
      status: { not: "REVOKED" },
    },
  });
  if (!connection)
    throw new Error(`Active ${connectorKey} connection not found`);
  return connection;
}

async function accessToken(connection: AppConnection) {
  const credentials = decryptConnectionCredentials(
    connection.encryptedCredentials,
  );
  const current = String(credentials.accessToken ?? "");
  if (!current)
    throw new Error(
      `${connection.connectorKey} connection has no access token`,
    );
  if (
    !connection.expiresAt ||
    connection.expiresAt.getTime() > Date.now() + 60_000
  )
    return current;
  const refreshToken = String(credentials.refreshToken ?? "");
  if (!refreshToken)
    throw new Error(`${connection.connectorKey} connection has expired`);
  let response: Response;
  if (connection.connectorKey === "google-sheets") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
      throw new Error("Google OAuth refresh is not configured");
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } else {
    if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET)
      throw new Error("Slack OAuth refresh is not configured");
    response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${process.env.SLACK_CLIENT_ID}:${process.env.SLACK_CLIENT_SECRET}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  }
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string")
    throw new Error(`${connection.connectorKey} token refresh failed`);
  const nextCredentials = {
    ...credentials,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? refreshToken,
  };
  await prisma.appConnection.update({
    where: { id: connection.id },
    data: {
      encryptedCredentials: encryptConnectionCredentials(nextCredentials),
      expiresAt:
        typeof body.expires_in === "number"
          ? new Date(Date.now() + body.expires_in * 1000)
          : null,
      status: "ACTIVE",
      lastError: null,
    },
  });
  return body.access_token;
}

function privateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function safeHttpUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:")
    throw new Error("HTTP connector only permits HTTPS URLs");
  if (
    ["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())
  )
    throw new Error("HTTP connector cannot access local services");
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => privateAddress(address))
  )
    throw new Error("HTTP connector cannot access private network addresses");
  return url;
}

function renderedObject(raw: unknown, metadata: Record<string, unknown>) {
  if (!raw) return {};
  const parsed = JSON.parse(parse(String(raw), metadata)) as unknown;
  return objectSchema.parse(parsed);
}

export async function executeConnectorAction(input: {
  actionType: string;
  connectorVersion: number;
  actionMetadata: Record<string, unknown>;
  runMetadata: Record<string, unknown>;
  userId: number;
  idempotencyKey: string;
}) {
  const {
    actionType,
    connectorVersion,
    actionMetadata,
    runMetadata,
    userId,
    idempotencyKey,
  } = input;
  if (connectorVersion !== 1)
    throw new Error(
      `Unsupported ${actionType} connector version: ${connectorVersion}`,
    );
  if (actionType === "email") {
    const connectionId = actionMetadata.connectionId;
    let options: Parameters<typeof sendEmail>[3];
    if (typeof connectionId === "string" && connectionId) {
      const connection = await ownedConnection(connectionId, userId, "email");
      const credentials = decryptConnectionCredentials(
        connection.encryptedCredentials,
      );
      options = {
        subject: actionMetadata.subject
          ? parse(String(actionMetadata.subject), runMetadata)
          : undefined,
        from: String(credentials.from),
        transport: {
          host: String(credentials.host),
          port: Number(credentials.port),
          secure: Boolean(credentials.secure),
          username: credentials.username
            ? String(credentials.username)
            : undefined,
          password: credentials.password
            ? String(credentials.password)
            : undefined,
        },
      };
    } else if (actionMetadata.subject) {
      options = { subject: parse(String(actionMetadata.subject), runMetadata) };
    }
    const result = await sendEmail(
      parse(String(actionMetadata.email ?? ""), runMetadata),
      parse(String(actionMetadata.body ?? ""), runMetadata),
      idempotencyKey,
      options,
    );
    return { messageId: result.messageId, accepted: result.accepted.length };
  }
  if (actionType === "http") {
    const method = String(actionMetadata.method ?? "GET").toUpperCase();
    const url = await safeHttpUrl(
      parse(String(actionMetadata.url ?? ""), runMetadata),
    );
    const headers = renderedObject(
      actionMetadata.headers,
      runMetadata,
    ) as Record<string, string>;
    const connectionId = actionMetadata.connectionId;
    if (typeof connectionId === "string" && connectionId) {
      const connection = await ownedConnection(connectionId, userId, "http");
      const credentials = decryptConnectionCredentials(
        connection.encryptedCredentials,
      );
      const authType = String(credentials.authType ?? "NONE");
      if (authType === "BEARER")
        headers.authorization = `Bearer ${String(credentials.token)}`;
      if (authType === "API_KEY")
        headers[String(credentials.headerName)] = String(credentials.apiKey);
      if (authType === "BASIC")
        headers.authorization = `Basic ${Buffer.from(`${String(credentials.username)}:${String(credentials.password)}`).toString("base64")}`;
    }
    const response = await fetch(url, {
      method,
      headers,
      redirect: "manual",
      ...(method !== "GET" && actionMetadata.body !== undefined
        ? { body: parse(String(actionMetadata.body), runMetadata) }
        : {}),
    });
    const body = (await response.text()).slice(0, 64_000);
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    return { status: response.status, body };
  }
  if (actionType === "slack") {
    const connection = await ownedConnection(
      String(actionMetadata.connectionId),
      userId,
      "slack",
    );
    const token = await accessToken(connection);
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channel: parse(String(actionMetadata.channel), runMetadata),
        text: parse(String(actionMetadata.text), runMetadata),
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || body.ok !== true)
      throw new Error(
        `Slack message failed: ${String(body.error ?? response.status)}`,
      );
    return { channel: body.channel, timestamp: body.ts };
  }
  if (actionType === "google-sheets") {
    const connection = await ownedConnection(
      String(actionMetadata.connectionId),
      userId,
      "google-sheets",
    );
    const token = await accessToken(connection);
    const spreadsheetId = parse(
      String(actionMetadata.spreadsheetId),
      runMetadata,
    );
    const range = parse(String(actionMetadata.range), runMetadata);
    const values = JSON.parse(
      parse(String(actionMetadata.values), runMetadata),
    ) as unknown;
    if (!Array.isArray(values))
      throw new Error("Google Sheets values must be a JSON array");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ majorDimension: "ROWS", values: [values] }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        `Google Sheets append failed: ${String((body.error as { message?: string } | undefined)?.message ?? response.status)}`,
      );
    return { spreadsheetId: body.spreadsheetId, updates: body.updates };
  }
  return null;
}
