import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import prisma from "@repo/db/client";
import { decryptConnectionCredentials } from "@repo/db/connection-crypto";
import {
  getConnectionAccessToken,
  isRevokedOAuthError,
} from "@repo/db/connection-oauth";
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

async function recordOAuthActionFailure(
  connectionId: string,
  connectorKey: "slack" | "google-sheets",
  responseStatus: number,
  body: Record<string, unknown>,
  message: string,
) {
  await prisma.appConnection.update({
    where: { id: connectionId },
    data: {
      status: isRevokedOAuthError(connectorKey, responseStatus, body)
        ? "REVOKED"
        : "ERROR",
      lastError: message,
    },
  });
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
    const token = await getConnectionAccessToken({
      connectionId: connection.id,
      connectorKey: "slack",
      userId,
    });
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
    if (!response.ok || body.ok !== true) {
      const message = `Slack message failed: ${String(body.error ?? response.status)}`;
      await recordOAuthActionFailure(
        connection.id,
        "slack",
        response.status,
        body,
        message,
      );
      throw new Error(message);
    }
    return { channel: body.channel, timestamp: body.ts };
  }
  if (actionType === "google-sheets") {
    const connection = await ownedConnection(
      String(actionMetadata.connectionId),
      userId,
      "google-sheets",
    );
    const token = await getConnectionAccessToken({
      connectionId: connection.id,
      connectorKey: "google-sheets",
      userId,
    });
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
    if (!response.ok) {
      const message = `Google Sheets append failed: ${String((body.error as { message?: string } | undefined)?.message ?? response.status)}`;
      await recordOAuthActionFailure(
        connection.id,
        "google-sheets",
        response.status,
        body,
        message,
      );
      throw new Error(message);
    }
    return { spreadsheetId: body.spreadsheetId, updates: body.updates };
  }
  return null;
}
