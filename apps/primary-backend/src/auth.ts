import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import prisma from "@repo/db/client";
import { config } from "./config";

const accessCookie = "flowforge_access";
const refreshCookie = "flowforge_refresh";
export const cookieNames = { accessCookie, refreshCookie };
export const hashOpaqueToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newOpaqueToken = () => randomBytes(32).toString("base64url");
export const hashPassword = (password: string) =>
  hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export async function verifyPassword(stored: string, supplied: string) {
  return stored.startsWith("$argon2")
    ? verify(stored, supplied)
    : stored === supplied;
}
export function setAccessCookie(
  res: Response,
  userId: number,
  sessionId: string,
) {
  const token = jwt.sign(
    { sub: String(userId), sid: sessionId, type: "access" },
    config.JWT_PASSWORD,
    {
      algorithm: "HS256",
      expiresIn: `${config.ACCESS_TOKEN_TTL_MINUTES}m`,
      issuer: "flowforge",
      audience: "flowforge-api",
    },
  );
  res.cookie(accessCookie, token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    maxAge: config.ACCESS_TOKEN_TTL_MINUTES * 60_000,
    path: "/",
  });
}
export async function createSession(res: Response, userId: number) {
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(
    Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  );
  const session = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
    },
  });
  setAccessCookie(res, userId, session.id);
  res.cookie(refreshCookie, refreshToken, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "strict",
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    path: "/api/v1/user",
  });
}
export function clearAuthCookies(res: Response) {
  res.clearCookie(accessCookie, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  });
  res.clearCookie(refreshCookie, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "strict",
    path: "/api/v1/user",
  });
}
export type AccessClaims = { sub: string; sid: string; type: "access" };
export function verifyAccessToken(token: string): AccessClaims {
  const claims = jwt.verify(token, config.JWT_PASSWORD, {
    algorithms: ["HS256"],
    issuer: "flowforge",
    audience: "flowforge-api",
  }) as AccessClaims;
  if (claims.type !== "access" || !claims.sid || !claims.sub)
    throw new Error("Invalid access token claims");
  return claims;
}
