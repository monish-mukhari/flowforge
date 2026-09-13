import nodemailer from "nodemailer";
import { z } from "zod";

const transport = nodemailer.createTransport({
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

export async function sendEmail(to: string, body: string) {
  const recipient = z.string().email().max(254).parse(to);
  const message = z.string().min(1).max(100_000).parse(body);
  await transport.sendMail({
    from: process.env.EMAIL_FROM || "no-reply@flowforge.local",
    to: recipient,
    subject: "FlowForge workflow notification",
    text: message,
  });
}
