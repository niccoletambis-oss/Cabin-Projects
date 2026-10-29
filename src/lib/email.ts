import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { appEnvironment, configuredAppUrl } from "./environment";
export type ResetEmail = { to: string; url: string };
export interface EmailProvider {
  sendPasswordReset(message: ResetEmail): Promise<void>;
}
export const smtpEmailProvider: EmailProvider = {
  async sendPasswordReset(message) {
    const secure =
      process.env.SMTP_SECURE === "true" ||
      Number(process.env.SMTP_PORT) === 465;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure,
      requireTLS: !secure,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      logger: false,
      debug: false,
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
      tls: {
        rejectUnauthorized: true,
        ...(process.env.SMTP_CA_FILE
          ? { ca: readFileSync(process.env.SMTP_CA_FILE, "utf8") }
          : {}),
      },
    });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: message.to,
        subject: "Reset your Cabin password",
        text: `A password reset was requested for your Cabin account.\n\n${message.url}\n\nThis single-use link expires in 30 minutes. If you did not request it, ignore this email. Your password and sessions have not changed.`,
      });
    } finally {
      transport.close();
    }
  },
};
export async function sendResetEmail(message: ResetEmail) {
  if (process.env.EMAIL_PROVIDER === "smtp")
    return smtpEmailProvider.sendPasswordReset(message);
  const host = new URL(configuredAppUrl()).hostname;
  if (
    appEnvironment() === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(host) &&
    process.env.DEV_RESET_LOG === "true"
  ) {
    // Explicit local-development opt-in only. Never production or test logging.
    console.info(`[LOCAL DEVELOPMENT ONLY] Password reset URL: ${message.url}`);
    return;
  }
  if (appEnvironment() === "production")
    throw new Error("Email delivery is not configured");
}
