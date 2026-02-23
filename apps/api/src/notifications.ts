import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import { logNotificationDelivery, type NotificationChannel } from "./notification-log";
import crypto from "crypto";
import { logError, logInfo, logWarn } from "./logger";

export interface Notification {
  notification_id: string;
  user_id: string;
  arn: string;
  event_type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: Date;
}

// C4: Pluggable notification transport (in-app + SMS + Email)
export interface NotificationTransport {
  name: string;
  channel: Extract<NotificationChannel, "SMS" | "EMAIL">;
  send(
    userId: string,
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
}

// Default: in-app only (database). External transports (Email, SMS) are registered at startup.
const transports: NotificationTransport[] = [];

function hashIdentifierForLog(value: string | undefined): string {
  if (!value) return "none";
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function notificationLogContext(arn: string | undefined, userId: string | undefined) {
  return {
    arnHash: hashIdentifierForLog(arn),
    userIdHash: hashIdentifierForLog(userId),
  };
}

export function registerTransport(transport: NotificationTransport): void {
  transports.push(transport);
  logInfo("Registered notification transport", { transport: transport.name });
}

async function createNotification(
  userId: string,
  arn: string,
  eventType: string,
  title: string,
  message: string
): Promise<void> {
  // Guard: Validate ARN exists in application table before creating notification
  const arnCheck = await query(
    "SELECT arn FROM application WHERE arn = $1 OR public_arn = $1 LIMIT 1",
    [arn]
  );
  
  if (arnCheck.rows.length === 0) {
    logWarn("Skipping notification because application was not found", notificationLogContext(arn, userId));
    return;
  }
  
  // Use the actual ARN from the database (not public_arn)
  const actualArn = arnCheck.rows[0].arn;
  
  const notificationId = uuidv4();
  await query(
    `INSERT INTO notification (notification_id, user_id, arn, event_type, title, message, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, false, NOW())`,
    [notificationId, userId, actualArn, eventType, title, message]
  );

  // Log the in-app delivery to notification_log
  try {
    await logNotificationDelivery({
      arn: actualArn,
      userId,
      notificationId,
      channel: "IN_APP",
      templateCode: eventType,
      subject: title,
      body: message,
      status: "DELIVERED",
    });
  } catch (logErr: any) {
    logWarn("Failed to log in-app notification delivery", {
      ...notificationLogContext(actualArn, userId),
      error: logErr?.message || "unknown_error",
    });
  }
}

/**
 * Notification functions: create notifications and optionally send via SMS/email gateway.
 */
export async function notify(event: string, arn: string, userId?: string, metadata?: any): Promise<void> {
  logInfo("Notification dispatch requested", {
    event,
    ...notificationLogContext(arn, userId),
    metadata,
  });
  
  if (!userId) {
    // Try to get userId from application
    const appResult = await query(
      "SELECT applicant_user_id FROM application WHERE arn = $1 OR public_arn = $1",
      [arn]
    );
    if (appResult.rows.length > 0 && appResult.rows[0].applicant_user_id) {
      userId = appResult.rows[0].applicant_user_id;
    } else {
      return; // No user to notify
    }
  }
  
  const eventMap: Record<string, { title: string; message: string }> = {
    APPLICATION_SUBMITTED: {
      title: "Application Submitted",
      message: `Your application ${arn} has been submitted successfully.`
    },
    QUERY_RAISED: {
      title: "Query Raised",
      message: `A query has been raised on your application ${arn}. Please respond.`
    },
    QUERY_RESPONDED: {
      title: "Query Responded",
      message: `Your response to the query on ${arn} has been received.`
    },
    APPLICATION_APPROVED: {
      title: "Application Approved",
      message: `Your application ${arn} has been approved.`
    },
    APPLICATION_REJECTED: {
      title: "Application Rejected",
      message: `Your application ${arn} has been rejected.`
    },
    OUTPUT_ISSUED: {
      title: "Certificate Ready",
      message: `Your certificate for ${arn} is ready for download.`
    },
    TASK_ASSIGNED: {
      title: "Application Under Review",
      message: `Your application ${arn} is now under review.`
    },
    DOCUMENT_REQUESTED: {
      title: "Document Required",
      message: `Additional documents are required for ${arn}.`
    }
  };
  
  const notification = eventMap[event] || {
    title: "Application Update",
    message: `Your application ${arn} has been updated.`
  };
  
  await createNotification(userId!, arn, event, notification.title, notification.message);

  // C4: Dispatch to external transports (SMS, Email, etc.)
  // Resolve the actual ARN for logging (userId was already resolved above)
  const arnResult = await query(
    "SELECT arn FROM application WHERE arn = $1 OR public_arn = $1 LIMIT 1",
    [arn]
  );
  const actualArn = arnResult.rows[0]?.arn || arn;

  for (const transport of transports) {
    const channel = transport.channel;
    try {
      await transport.send(userId!, notification.title, notification.message, { arn, event });

      // Log successful dispatch
      try {
        await logNotificationDelivery({
          arn: actualArn,
          userId: userId!,
          channel,
          templateCode: event,
          subject: notification.title,
          body: notification.message,
          status: "SENT",
        });
      } catch (logErr: any) {
        logWarn("Failed to log notification delivery", {
          channel,
          event,
          ...notificationLogContext(actualArn, userId),
          error: logErr?.message || "unknown_error",
        });
      }
    } catch (err: any) {
      logError("Notification transport error", {
        transport: transport.name,
        event,
        ...notificationLogContext(actualArn, userId),
        error: err?.message || "unknown_error",
      });

      // Log failed dispatch
      try {
        await logNotificationDelivery({
          arn: actualArn,
          userId: userId!,
          channel,
          templateCode: event,
          subject: notification.title,
          body: notification.message,
          status: "FAILED",
          failureReason: err.message,
        });
      } catch (logErr: any) {
        logWarn("Failed to log notification delivery failure", {
          channel,
          event,
          ...notificationLogContext(actualArn, userId),
          error: logErr?.message || "unknown_error",
        });
      }
    }
  }
}

export async function notifySubmitted(arn: string, userId?: string): Promise<void> {
  await notify("APPLICATION_SUBMITTED", arn, userId);
}

export async function notifyQueryRaised(arn: string, userId?: string): Promise<void> {
  await notify("QUERY_RAISED", arn, userId);
}

export async function notifyQueryResponded(arn: string, userId?: string): Promise<void> {
  await notify("QUERY_RESPONDED", arn, userId);
}

export async function notifyApproved(arn: string, userId?: string): Promise<void> {
  await notify("APPLICATION_APPROVED", arn, userId);
}

export async function notifyRejected(arn: string, userId?: string): Promise<void> {
  await notify("APPLICATION_REJECTED", arn, userId);
}

export async function notifyOutputIssued(arn: string, userId?: string): Promise<void> {
  await notify("OUTPUT_ISSUED", arn, userId);
}

export async function getUserNotifications(
  userId: string,
  limit: number = 20,
  offset: number = 0,
  unreadOnly: boolean = false
): Promise<Notification[]> {
  let sql = "SELECT notification_id, user_id, arn, event_type, title, message, read, created_at FROM notification WHERE user_id = $1";
  const params: any[] = [userId];
  
  if (unreadOnly) {
    sql += " AND read = false";
  }
  
  sql += " ORDER BY created_at DESC LIMIT $2 OFFSET $3";
  params.push(limit, offset);
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    notification_id: row.notification_id,
    user_id: row.user_id,
    arn: row.arn,
    event_type: row.event_type,
    title: row.title,
    message: row.message,
    read: row.read,
    created_at: row.created_at
  }));
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await query(
    "UPDATE notification SET read = true WHERE notification_id = $1 AND user_id = $2",
    [notificationId, userId]
  );
}
