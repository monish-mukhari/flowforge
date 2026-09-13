import nodemailer from "nodemailer";
import { config } from "./config";

const transport = nodemailer.createTransport({
  host: config.SMTP_ENDPOINT,
  port: config.SMTP_PORT,
  secure: false,
  auth: config.SMTP_USERNAME
    ? { user: config.SMTP_USERNAME, pass: config.SMTP_PASSWORD }
    : undefined,
});

export async function sendVerificationEmail(to: string, token: string) {
  const url = `${config.APP_PUBLIC_URL}/login?verificationToken=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject: "Verify your FlowForge account",
    text: `Verify your account: ${url}`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${config.APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject: "Reset your FlowForge password",
    text: `Reset your password: ${url}\nThis link expires in one hour.`,
  });
}
