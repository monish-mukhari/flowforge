import type { NextFunction, Request, Response } from "express";
import prisma from "@repo/db/client";
import { cookieNames, verifyAccessToken } from "./auth";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const token = req.cookies?.[cookieNames.accessCookie] ?? bearer;
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
      requestId: req.id,
    });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    const session = await prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: Number(payload.sub),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) throw new Error("Inactive session");
    req.userId = Number(payload.sub);
    req.sessionId = payload.sid;
    next();
  } catch {
    res.status(401).json({
      error: {
        code: "INVALID_SESSION",
        message: "Session is invalid or expired",
      },
      requestId: req.id,
    });
  }
}
