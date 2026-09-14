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
const workflowName = z.string().trim().min(1).max(120);
const workflowDescription = z.string().trim().max(1000).nullable();
const workflowAction = z
  .object({
    id: z.string().uuid().optional(),
    availableActionId: z.string().min(1).max(100),
    actionMetadata: metadata.optional(),
  })
  .strict();
export const ZapCreateSchema = z
  .object({
    name: workflowName.default("Untitled workflow"),
    description: workflowDescription.optional(),
    availableTriggerId: z.string().min(1).max(100),
    triggerMetadata: metadata.optional(),
    actions: z.array(workflowAction).min(1).max(25),
  })
  .strict();
export const ZapUpdateSchema = z
  .object({
    name: workflowName.optional(),
    description: workflowDescription.optional(),
    availableTriggerId: z.string().min(1).max(100).optional(),
    triggerMetadata: metadata.optional(),
    actions: z.array(workflowAction).min(1).max(25).optional(),
    requireSignature: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one workflow field is required",
  });
export const ZapIdSchema = z.object({ zapId: z.string().uuid() });
export const ZapListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"]).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();
export const ZapReorderSchema = z
  .object({ actionIds: z.array(z.string().uuid()).min(1).max(25) })
  .strict();

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      sessionId?: string;
    }
  }
}
