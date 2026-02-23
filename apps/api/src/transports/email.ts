/**
 * Email notification transport via nodemailer.
 *
 * Configuration via environment variables:
 *   EMAIL_PROVIDER   — "stub" (default) or "smtp"
 *   SMTP_HOST        — SMTP server host (default: localhost)
 *   SMTP_PORT        — SMTP port (default: 587)
 *   SMTP_SECURE      — "true" for TLS on connect (port 465), default false
 *   SMTP_USER        — SMTP authentication username
 *   SMTP_PASS        — SMTP authentication password
 *   SMTP_FROM        — From address (default: "PUDA <noreply@puda.gov.in>")
 *   EMAIL_ENABLED    — Set to "true" to enable actual email sending (default: false)
 *
 * In development/test, emails are logged to console when EMAIL_ENABLED !== "true".
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { NotificationTransport } from "../notifications";
import { query } from "../db";
import { logError, logInfo, logWarn } from "../logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "localhost";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
    // Do not reject self-signed certs in dev
    tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
  });

  return transporter;
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

const stubEmailTransport: NotificationTransport = {
  name: "EMAIL_STUB",
  channel: "EMAIL",
  async send(userId: string, title: string, _message: string, metadata?: Record<string, unknown>): Promise<void> {
    const userResult = await query('SELECT email FROM "user" WHERE user_id = $1', [userId]);
    const email = userResult.rows[0]?.email as string | undefined;
    if (!email) {
      logWarn("Skipping email notification: recipient has no email", { userId });
      return;
    }
    logInfo("Email stub adapter accepted notification", {
      to: maskEmail(email),
      subject: title,
      arn: metadata?.arn,
      event: metadata?.event,
    });
  },
};

const smtpEmailTransport: NotificationTransport = {
  name: "EMAIL_SMTP",
  channel: "EMAIL",

  async send(
    userId: string,
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Look up user email address
    const userResult = await query('SELECT email, name FROM "user" WHERE user_id = $1', [userId]);
    const email = userResult.rows[0]?.email as string | undefined;

    if (!email) {
      logWarn("Skipping email notification: recipient has no email", { userId });
      return;
    }

    const from = process.env.SMTP_FROM || "PUDA <noreply@puda.gov.in>";
    const arn = String(metadata?.arn || "");
    const event = String(metadata?.event || "");

    // Build an HTML email body
    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 1.25rem;">PUDA - Punjab Urban Development Authority</h1>
  </div>
  <div style="background: white; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1e40af;">${title}</h2>
    <p style="line-height: 1.6;">${message}</p>
    ${arn ? `<p style="font-size: 0.9rem; color: #666;">Application Reference: <strong>${arn}</strong></p>` : ""}
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
    <p style="font-size: 0.8rem; color: #999;">
      This is an automated notification from the PUDA Online Services Portal.
      Please do not reply to this email.
    </p>
  </div>
</body>
</html>`.trim();

    if (process.env.EMAIL_ENABLED !== "true") {
      // Dev/test: log instead of sending
      logInfo("Email dispatch suppressed (EMAIL_ENABLED=false)", {
        to: maskEmail(email),
        subject: title,
        arn,
        event,
      });
      return;
    }

    try {
      const transport = getTransporter();
      await transport.sendMail({
        from,
        to: email,
        subject: `PUDA: ${title}`,
        text: `${title}\n\n${message}\n\nApplication Reference: ${arn}`,
        html: htmlBody,
      });
      logInfo("Email sent", { to: maskEmail(email), subject: title, arn, event });
    } catch (err) {
      logError("Email send failed", {
        to: maskEmail(email),
        subject: title,
        arn,
        event,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't throw — notification failures should not break the main flow
    }
  },
};

export function createEmailTransport(): NotificationTransport {
  const provider = (process.env.EMAIL_PROVIDER || "stub").trim().toLowerCase();
  if (provider === "smtp") return smtpEmailTransport;
  if (provider !== "stub") {
    logWarn("Unknown EMAIL_PROVIDER configured, using stub adapter", { provider });
  }
  return stubEmailTransport;
}

// Backward-compatible export used by existing imports.
export const nodemailerTransport = smtpEmailTransport;
