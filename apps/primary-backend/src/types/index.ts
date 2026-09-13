import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const SignupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    username: email,
    password: z.string().min(10).max(128),
  })
  .strict();
export const SigninSchema = z
  .object({ username: email, password: z.string().min(1).max(128) })
  .strict();
export const TokenSchema = z
  .object({ token: z.string().min(20).max(512) })
  .strict();
export const ForgotPasswordSchema = z.object({ username: email }).strict();
export const ResetPasswordSchema = z
  .object({
    token: z.string().min(20).max(512),
    password: z.string().min(10).max(128),
  })
  .strict();
const metadata = z.record(z.string(), z.unknown()).default({});
export const ZapCreateSchema = z
  .object({
    availableTriggerId: z.string().min(1).max(100),
    triggerMetadata: metadata.optional(),
    actions: z
      .array(
        z
          .object({
            availableActionId: z.string().min(1).max(100),
            actionMetadata: metadata.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict();
export const ZapIdSchema = z.object({ zapId: z.string().uuid() });

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      sessionId?: string;
    }
  }
}
