/**
 * H3: SLA Breach Detection
 * 
 * Runs periodically to detect tasks that have exceeded their SLA due date
 * and creates breach notifications + audit events.
 * 
 * Can be run as a cron job or scheduled by the application at startup.
 */
import { getClient, query } from "./db";
import { v4 as uuidv4 } from "uuid";
import { logError, logInfo } from "./logger";

export interface SLABreachResult {
  breachedTasks: number;
  notificationsCreated: number;
  errors: string[];
}

/**
 * Check all open tasks for SLA breaches and create notifications.
 */
export async function detectSLABreaches(): Promise<SLABreachResult> {
  const result: SLABreachResult = { breachedTasks: 0, notificationsCreated: 0, errors: [] };

  try {
    // Find tasks that are past SLA but not yet flagged as breached
    const breachedTasksResult = await query(
      `SELECT t.task_id, t.arn, t.state_id, t.system_role_id, t.sla_due_at,
              a.service_key, a.authority_id, a.applicant_user_id, a.public_arn
       FROM task t
       JOIN application a ON t.arn = a.arn
       WHERE t.status IN ('PENDING', 'IN_PROGRESS')
         AND t.sla_due_at IS NOT NULL
         AND t.sla_due_at < NOW()
         AND NOT EXISTS (
           SELECT 1 FROM audit_event ae
           WHERE ae.arn = t.arn
             AND ae.event_type = 'SLA_BREACHED'
             AND (ae.payload_jsonb->>'taskId')::text = t.task_id
         )`
    );

    result.breachedTasks = breachedTasksResult.rows.length;
    if (result.breachedTasks === 0) return result;

    // PERF-017: Set-based processing — single transaction for all breached tasks
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Prepare arrays for batch operations
      const auditIds: string[] = [];
      const auditArns: string[] = [];
      const auditPayloads: string[] = [];
      const notifIds: string[] = [];
      const notifUserIds: string[] = [];
      const notifArns: string[] = [];
      const notifMessages: string[] = [];
      const taskIds: string[] = [];
      const breachedAt = new Date().toISOString();

      for (const task of breachedTasksResult.rows) {
        auditIds.push(uuidv4());
        auditArns.push(task.arn);
        auditPayloads.push(JSON.stringify({
          taskId: task.task_id,
          stateId: task.state_id,
          systemRoleId: task.system_role_id,
          slaDueAt: task.sla_due_at,
          breachedAt,
        }));
        taskIds.push(task.task_id);

        if (task.applicant_user_id) {
          notifIds.push(uuidv4());
          notifUserIds.push(task.applicant_user_id);
          notifArns.push(task.arn);
          notifMessages.push(
            `Your application ${task.public_arn || task.arn} has exceeded the expected processing time at ${task.state_id}. The authority has been notified.`
          );
        }
      }

      // Bulk insert audit events
      await client.query(
        `INSERT INTO audit_event (event_id, arn, event_type, actor_type, payload_jsonb)
         SELECT unnest($1::text[]), unnest($2::text[]), 'SLA_BREACHED', 'SYSTEM', unnest($3::jsonb[])`,
        [auditIds, auditArns, auditPayloads]
      );

      // Bulk insert notifications
      if (notifIds.length > 0) {
        await client.query(
          `INSERT INTO notification (notification_id, user_id, arn, event_type, title, message, read, created_at)
           SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]),
                  'SLA_BREACHED', 'Application SLA Breach', unnest($4::text[]), false, NOW()`,
          [notifIds, notifUserIds, notifArns, notifMessages]
        );
        result.notificationsCreated = notifIds.length;
      }

      // Bulk update task remarks
      await client.query(
        `UPDATE task SET remarks = COALESCE(remarks || '; ', '') || 'SLA_BREACHED at ' || NOW()::text
         WHERE task_id = ANY($1::text[])`,
        [taskIds]
      );

      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      result.errors.push(`Set-based SLA processing failed: ${err.message}`);
    } finally {
      client.release();
    }
  } catch (err: any) {
    result.errors.push(`SLA check failed: ${err.message}`);
  }

  if (result.breachedTasks > 0) {
    logInfo("SLA breach scan completed", {
      breachedTasks: result.breachedTasks,
      notificationsCreated: result.notificationsCreated,
    });
  }

  return result;
}

/**
 * Start periodic SLA breach checking.
 * Default: runs every 30 minutes.
 */
export function startSLAChecker(intervalMs: number = 30 * 60 * 1000): NodeJS.Timeout {
  const configuredInitialDelayMs = Number.parseInt(
    process.env.SLA_CHECK_INITIAL_DELAY_MS || "30000",
    10
  );
  const initialDelayMs = Number.isFinite(configuredInitialDelayMs) && configuredInitialDelayMs >= 0
    ? configuredInitialDelayMs
    : 30000;
  logInfo("Starting SLA breach checker", {
    intervalSeconds: intervalMs / 1000,
    initialDelaySeconds: initialDelayMs / 1000,
  });

  setTimeout(() => {
    detectSLABreaches().catch((err) => {
      logError("Initial SLA check failed", { error: err instanceof Error ? err.message : String(err) });
    });
  }, initialDelayMs).unref();
  
  // Then run periodically
  return setInterval(() => {
    detectSLABreaches().catch((err) => {
      logError("Periodic SLA check failed", { error: err instanceof Error ? err.message : String(err) });
    });
  }, intervalMs);
}
