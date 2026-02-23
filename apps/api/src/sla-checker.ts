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

    for (const task of breachedTasksResult.rows) {
      const client = await getClient();
      try {
        await client.query("BEGIN");

        // Create audit event for the breach
        await client.query(
          `INSERT INTO audit_event (event_id, arn, event_type, actor_type, payload_jsonb)
           VALUES ($1, $2, 'SLA_BREACHED', 'SYSTEM', $3)`,
          [
            uuidv4(),
            task.arn,
            JSON.stringify({
              taskId: task.task_id,
              stateId: task.state_id,
              systemRoleId: task.system_role_id,
              slaDueAt: task.sla_due_at,
              breachedAt: new Date().toISOString(),
            }),
          ]
        );

        // Create notification for the applicant
        if (task.applicant_user_id) {
          const message = `Your application ${task.public_arn || task.arn} has exceeded the expected processing time at ${task.state_id}. The authority has been notified.`;
          await client.query(
            `INSERT INTO notification (notification_id, user_id, arn, event_type, title, message, read, created_at)
             VALUES ($1, $2, $3, 'SLA_BREACHED', $4, $5, false, NOW())`,
            [
              uuidv4(),
              task.applicant_user_id,
              task.arn,
              "Application SLA Breach",
              message,
            ]
          );
          result.notificationsCreated++;
        }

        // Also flag the task itself
        await client.query(
          `UPDATE task SET remarks = COALESCE(remarks || '; ', '') || 'SLA_BREACHED at ' || NOW()::text
           WHERE task_id = $1`,
          [task.task_id]
        );
        await client.query("COMMIT");
      } catch (err: any) {
        await client.query("ROLLBACK").catch(() => {});
        result.errors.push(`Task ${task.task_id}: ${err.message}`);
      } finally {
        client.release();
      }
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
