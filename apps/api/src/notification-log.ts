/**
 * Notification Log DAL — multi-channel delivery audit trail.
 *
 * Every notification sent via any channel (SMS, EMAIL, IN_APP) is logged
 * here with delivery status tracking. This complements the existing
 * `notification` table (in-app inbox) by capturing the full delivery
 * picture across all channels.
 */
import { query } from "./db";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationChannel = "SMS" | "EMAIL" | "IN_APP";
export type DeliveryStatus = "SENT" | "FAILED" | "DELIVERED" | "UNKNOWN";

export interface NotificationLogEntry {
  log_id: string;
  arn: string | null;
  user_id: string | null;
  notification_id: string | null;
  channel: NotificationChannel;
  template_code: string | null;
  recipient_address: string | null;
  subject: string | null;
  body: string | null;
  status: DeliveryStatus;
  provider_ref: string | null;
  failure_reason: string | null;
  sent_at: Date;
  delivered_at: Date | null;
  created_at: Date;
}

export interface CreateLogEntryInput {
  arn?: string;
  userId?: string;
  notificationId?: string;
  channel: NotificationChannel;
  templateCode?: string;
  recipientAddress?: string;
  subject?: string;
  body?: string;
  status?: DeliveryStatus;
  providerRef?: string;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** Log a notification delivery attempt. */
export async function logNotificationDelivery(
  input: CreateLogEntryInput
): Promise<NotificationLogEntry> {
  const id = uuidv4();
  await query(
    `INSERT INTO notification_log
       (log_id, arn, user_id, notification_id,
        channel, template_code, recipient_address,
        subject, body, status, provider_ref, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      input.arn || null,
      input.userId || null,
      input.notificationId || null,
      input.channel,
      input.templateCode || null,
      input.recipientAddress || null,
      input.subject || null,
      input.body || null,
      input.status || "SENT",
      input.providerRef || null,
      input.failureReason || null,
    ]
  );
  return (await getLogEntry(id))!;
}

/** Update delivery status (e.g. when a webhook confirms delivery or failure). */
export async function updateDeliveryStatus(
  logId: string,
  status: DeliveryStatus,
  options?: {
    providerRef?: string;
    failureReason?: string;
    deliveredAt?: Date;
  }
): Promise<NotificationLogEntry | null> {
  await query(
    `UPDATE notification_log SET
       status = $2,
       provider_ref = COALESCE($3, provider_ref),
       failure_reason = COALESCE($4, failure_reason),
       delivered_at = COALESCE($5, delivered_at)
     WHERE log_id = $1`,
    [
      logId,
      status,
      options?.providerRef || null,
      options?.failureReason || null,
      options?.deliveredAt || (status === "DELIVERED" ? new Date() : null),
    ]
  );
  return getLogEntry(logId);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getLogEntry(logId: string): Promise<NotificationLogEntry | null> {
  const result = await query(
    "SELECT * FROM notification_log WHERE log_id = $1",
    [logId]
  );
  return result.rows.length > 0 ? rowToLogEntry(result.rows[0]) : null;
}

/** Get all notification logs for an application (across all channels). */
export async function getLogsForApplication(
  arn: string,
  channel?: NotificationChannel
): Promise<NotificationLogEntry[]> {
  const channelFilter = channel ? " AND channel = $2" : "";
  const params: unknown[] = [arn];
  if (channel) params.push(channel);

  const result = await query(
    `SELECT * FROM notification_log WHERE arn = $1${channelFilter} ORDER BY sent_at DESC`,
    params
  );
  return result.rows.map(rowToLogEntry);
}

/** Get all notification logs for a user. */
export async function getLogsForUser(
  userId: string,
  limit = 50,
  offset = 0,
  authorityIds?: string[]
): Promise<NotificationLogEntry[]> {
  const result = authorityIds && authorityIds.length > 0
    ? await query(
      `SELECT nl.*
       FROM notification_log nl
       JOIN application a ON a.arn = nl.arn
       WHERE nl.user_id = $1
         AND a.authority_id = ANY($4)
       ORDER BY nl.sent_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset, authorityIds]
    )
    : await query(
      "SELECT * FROM notification_log WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
  return result.rows.map(rowToLogEntry);
}

/** Get delivery stats for an application (count by channel and status). */
export async function getDeliveryStats(arn: string): Promise<Array<{ channel: string; status: string; count: number }>> {
  const result = await query(
    `SELECT channel, status, COUNT(*)::int as count
     FROM notification_log WHERE arn = $1
     GROUP BY channel, status ORDER BY channel, status`,
    [arn]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToLogEntry(row: any): NotificationLogEntry {
  return {
    log_id: row.log_id,
    arn: row.arn,
    user_id: row.user_id,
    notification_id: row.notification_id,
    channel: row.channel as NotificationChannel,
    template_code: row.template_code,
    recipient_address: row.recipient_address,
    subject: row.subject,
    body: row.body,
    status: row.status as DeliveryStatus,
    provider_ref: row.provider_ref,
    failure_reason: row.failure_reason,
    sent_at: row.sent_at,
    delivered_at: row.delivered_at,
    created_at: row.created_at,
  };
}
