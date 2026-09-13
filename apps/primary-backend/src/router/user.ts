import { Router } from "express";
import { authMiddleware } from "../middleware";
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SignupSchema,
  SigninSchema,
  TokenSchema,
} from "../types";
import prisma from "@repo/db/client";
import {
  clearAuthCookies,
  cookieNames,
  createSession,
  hashOpaqueToken,
  hashPassword,
  newOpaqueToken,
  setAccessCookie,
  verifyPassword,
} from "../auth";
import { asyncRoute, HttpError } from "../errors";
import { sendPasswordResetEmail, sendVerificationEmail } from "../mail";
import { config } from "../config";

const router = Router();

router.post(
  "/signup",
  asyncRoute(async (req, res) => {
    const data = SignupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { email: data.username },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (existing?.emailVerifiedAt)
      throw new HttpError(
        409,
        "ACCOUNT_EXISTS",
        "An account with this email already exists",
      );
    const token = newOpaqueToken();
    const tokenData = {
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    };
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            passwordHash: await hashPassword(data.password),
            emailVerificationTokens: { deleteMany: {}, create: tokenData },
          },
        })
      : await prisma.user.create({
          data: {
            name: data.name,
            email: data.username,
            passwordHash: await hashPassword(data.password),
            emailVerificationTokens: { create: tokenData },
          },
        });
    await sendVerificationEmail(user.email, token);
    return res
      .status(201)
      .json({ message: "Please verify your account by checking your email" });
  }),
);

router.post(
  "/signin",
  asyncRoute(async (req, res) => {
    const data = SigninSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: data.username },
    });
    if (!user || !(await verifyPassword(user.passwordHash, data.password)))
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect",
      );
    if (!user.emailVerifiedAt)
      throw new HttpError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Verify your email before signing in",
      );
    if (!user.passwordHash.startsWith("$argon2"))
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(data.password) },
      });
    await createSession(res, user.id);
    return res.json({
      user: { id: user.id, name: user.name, email: user.email },
    });
  }),
);

router.post(
  "/verify-email",
  asyncRoute(async (req, res) => {
    const { token } = TokenSchema.parse(req.body);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!record || record.expiresAt <= new Date())
      throw new HttpError(
        400,
        "INVALID_TOKEN",
        "Verification link is invalid or expired",
      );
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.deleteMany({
        where: { userId: record.userId },
      }),
    ]);
    return res.json({ message: "Email verified. You can now sign in." });
  }),
);

router.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const rawToken = req.cookies?.[cookieNames.refreshCookie];
    if (!rawToken)
      throw new HttpError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Refresh token is missing",
      );
    const session = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashOpaqueToken(rawToken) },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      clearAuthCookies(res);
      throw new HttpError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Refresh token is invalid or expired",
      );
    }
    const nextToken = newOpaqueToken();
    await prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashOpaqueToken(nextToken) },
    });
    setAccessCookie(res, session.userId, session.id);
    res.cookie(cookieNames.refreshCookie, nextToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: "strict",
      maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()),
      path: "/api/v1/user",
    });
    return res.status(204).send();
  }),
);

router.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const rawToken = req.cookies?.[cookieNames.refreshCookie];
    if (rawToken)
      await prisma.authSession.updateMany({
        where: { refreshTokenHash: hashOpaqueToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    clearAuthCookies(res);
    return res.status(204).send();
  }),
);

router.post(
  "/forgot-password",
  asyncRoute(async (req, res) => {
    const { username } = ForgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: username } });
    if (user) {
      const token = newOpaqueToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      });
      await sendPasswordResetEmail(user.email, token);
    }
    return res.json({
      message: "If that account exists, a reset link has been sent",
    });
  }),
);

router.post(
  "/reset-password",
  asyncRoute(async (req, res) => {
    const data = ResetPasswordSchema.parse(req.body);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(data.token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date())
      throw new HttpError(
        400,
        "INVALID_TOKEN",
        "Reset link is invalid or expired",
      );
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(data.password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    clearAuthCookies(res);
    return res.json({ message: "Password reset. You can now sign in." });
  }),
);

router.get(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { name: true, email: true, emailVerifiedAt: true },
    });
    return res.json({ user });
  }),
);

export const userRouter = router;
