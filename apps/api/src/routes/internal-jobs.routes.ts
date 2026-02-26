/**
 * ARC-016/H9: HTTP-triggered internal job endpoints.
 *
 * When INTERNAL_JOB_SECRET is set, these routes replace the setInterval-based
 * periodic jobs, allowing Cloud Scheduler or cron to trigger them externally.
 * Each endpoint is gated by the X-Internal-Secret header.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { detectSLABreaches } from "../sla-checker";
import { cleanupClientTelemetryEvents } from "../telemetry-retention";
import { cleanupExpiredRevocations } from "../token-security";
import { cleanupExpiredMfaChallenges } from "../mfa-stepup";
import { verifyAuditChainIntegrity } from "../audit-chain";
import { updateWorkflowBacklogMetric } from "../observability/metrics";
import { query as dbQuery } from "../db";

function verifyInternalSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.INTERNAL_JOB_SECRET;
  if (!expected) {
    reply.code(404).send({ error: "NOT_FOUND", message: "Not found", statusCode: 404 });
    return false;
  }
  const provided = request.headers["x-internal-secret"];
  if (provided !== expected) {
    reply.code(401).send({ error: "UNAUTHORIZED", message: "Invalid internal secret", statusCode: 401 });
    return false;
  }
  return true;
}

export function registerInternalJobRoutes(app: FastifyInstance): void {
  // SLA breach detection
  app.post("/internal/jobs/escalate-sla", async (request, reply) => {
    if (!verifyInternalSecret(request, reply)) return;
    const result = await detectSLABreaches();
    return { ok: true, ...result };
  });

  // Client telemetry retention cleanup
  app.post("/internal/jobs/cleanup-telemetry", async (request, reply) => {
    if (!verifyInternalSecret(request, reply)) return;
    const result = await cleanupClientTelemetryEvents();
    return { ok: true, ...result };
  });

  // Workflow backlog metrics refresh
  app.post("/internal/jobs/refresh-backlog-metrics", async (request, reply) => {
    if (!verifyInternalSecret(request, reply)) return;
    const result = await dbQuery(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('PENDING', 'IN_PROGRESS'))::int AS open_tasks,
         COUNT(*) FILTER (
           WHERE status IN ('PENDING', 'IN_PROGRESS')
             AND sla_due_at IS NOT NULL
             AND sla_due_at < NOW()
         )::int AS overdue_tasks
       FROM task`
    );
    const openTasks = Number(result.rows[0]?.open_tasks || 0);
    const overdueTasks = Number(result.rows[0]?.overdue_tasks || 0);
    updateWorkflowBacklogMetric({ openTasks, overdueTasks });
    return { ok: true, openTasks, overdueTasks };
  });

  // JWT token revocation cleanup
  app.post("/internal/jobs/cleanup-revocations", async (request, reply) => {
    if (!verifyInternalSecret(request, reply)) return;
    const deletedCount = await cleanupExpiredRevocations();
    return { ok: true, deletedCount };
  });

  // MFA challenge cleanup
  app.post("/internal/jobs/cleanup-mfa-challenges", async (request, reply) => {
    if (!verifyInternalSecret(request, reply)) return;
    const deletedCount = await cleanupExpiredMfaChallenges();
    return { ok: true, deletedCount };
  });

  // Audit chain verification
  app.post("/internal/jobs/verify-audit-chain", async (request, reply) => {
    if (!verifyInternalSecret(request, reply)) return;
    const result = await verifyAuditChainIntegrity();
    return { ok: result.ok, checked: result.checked, mismatch: result.mismatch };
  });
}
