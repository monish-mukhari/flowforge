import nodemailer from "nodemailer";
import { z } from "zod";

const defaultTransport = nodemailer.createTransport({
  host: process.env.SMTP_ENDPOINT,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USERNAME
    ? {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      }
    : undefined,
});

export async function sendEmail(
  to: string,
  body: string,
  idempotencyKey?: string,
  options?: {
    subject?: string;
    from?: string;
    transport?: {
      host: string;
      port: number;
      secure: boolean;
      username?: string;
      password?: string;
    };
  },
) {
  const recipient = z.string().email().max(254).parse(to);
  const message = z.string().min(1).max(100_000).parse(body);
  const transport = options?.transport
    ? nodemailer.createTransport({
        host: options.transport.host,
        port: options.transport.port,
        secure: options.transport.secure,
        auth: options.transport.username
          ? {
              user: options.transport.username,
              pass: options.transport.password ?? "",
            }
          : undefined,
      })
    : defaultTransport;
  return transport.sendMail({
    from: options?.from ?? process.env.EMAIL_FROM ?? "no-reply@flowforge.local",
    to: recipient,
    subject: options?.subject ?? "FlowForge workflow notification",
    text: message,
    ...(idempotencyKey
      ? { messageId: `<${idempotencyKey}@flowforge.local>` }
      : {}),
  });
}
