import { query } from "../db";
import { logInfo, logWarn } from "../logger";
import type { NotificationTransport } from "../notifications";

function maskPhone(phone: string): string {
  if (!phone) return "***";
  if (phone.length <= 4) return "*".repeat(phone.length);
  return `${"*".repeat(phone.length - 4)}${phone.slice(-4)}`;
}

const stubSmsTransport: NotificationTransport = {
  name: "SMS_STUB",
  channel: "SMS",
  async send(
    userId: string,
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const userResult = await query('SELECT phone FROM "user" WHERE user_id = $1', [userId]);
    const phone = userResult.rows[0]?.phone as string | undefined;
    if (!phone) {
      logWarn("Skipping SMS notification: recipient has no phone", { userId });
      return;
    }

    const payloadPreview = `${title}: ${message}`.slice(0, 120);
    if (process.env.SMS_ENABLED !== "true") {
      logInfo("SMS dispatch suppressed (SMS_ENABLED=false)", {
        to: maskPhone(phone),
        preview: payloadPreview,
        arn: metadata?.arn,
        event: metadata?.event,
      });
      return;
    }

    // Runtime stub: keeps production call surface stable until a real SMS provider is integrated.
    logInfo("SMS stub adapter accepted notification", {
      to: maskPhone(phone),
      preview: payloadPreview,
      arn: metadata?.arn,
      event: metadata?.event,
    });
  },
};

export function createSmsTransport(): NotificationTransport {
  const provider = (process.env.SMS_PROVIDER || "stub").trim().toLowerCase();
  if (provider !== "stub") {
    logWarn("Unknown SMS_PROVIDER configured, using stub adapter", { provider });
  }
  return stubSmsTransport;
}

export { stubSmsTransport };
