import { FastifyInstance } from "fastify";
import * as applications from "../applications";
import { getPropertyByUPN } from "../properties";
import { getAuthUserId, send400, send403 } from "../errors";
import { requireValidAuthorityId } from "../route-access";
import {
  toClientApplication,
  resolveBackofficeAuthorityScope,
  createAppSchema,
  applicationListSchema,
  userScopedReadSchema,
  applicationSearchSchema,
  applicationExportSchema,
} from "./application.routes";

export async function registerApplicationCrudRoutes(app: FastifyInstance) {
  // POST /api/v1/applications — create a new application
  app.post("/api/v1/applications", { schema: createAppSchema }, async (request, reply) => {
    const body = request.body as {
      authorityId: string; serviceKey: string; applicantUserId?: string;
      data?: any; submissionChannel?: string; assistedByUserId?: string;
    };
    const validAuthority = await requireValidAuthorityId(reply, body.authorityId);
    if (!validAuthority) return;
    // Security: citizens must always use JWT identity, not body applicantUserId.
    // Admin can optionally create on behalf of another user.
    const applicantUserId =
      request.authUser?.userType === "ADMIN"
        ? (body.applicantUserId || request.authUser.userId)
        : (request.authUser?.userId || getAuthUserId(request, "applicantUserId"));
    try {
      const application = await applications.createApplication(
        body.authorityId, body.serviceKey, applicantUserId || undefined, body.data,
        body.submissionChannel, body.assistedByUserId
      );
      return toClientApplication(application);
    } catch (error: any) {
      return send400(reply, error.message);
    }
  });

  // GET /api/v1/applications — list user's applications
  app.get("/api/v1/applications", { schema: applicationListSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const q = request.query as any;
    const limit = Math.min(parseInt(q.limit || "50", 10), 200);
    const offset = parseInt(q.offset || "0", 10);
    const apps = await applications.getUserApplications(userId, q.status, limit, offset);
    return { applications: apps.map(toClientApplication) };
  });

  // GET /api/v1/applications/stats — counts by state
  app.get("/api/v1/applications/stats", { schema: userScopedReadSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    return applications.getUserApplicationStats(userId);
  });

  // GET /api/v1/applications/pending-actions — pending actions for citizen
  app.get("/api/v1/applications/pending-actions", { schema: userScopedReadSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    return applications.getUserPendingActions(userId);
  });

  // GET /api/v1/applications/nudges — overdue applications / expiring docs
  app.get("/api/v1/applications/nudges", { schema: userScopedReadSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const { query: dbQuery } = await import("../db");

    const [expiringDocs, stalledApps, pendingActions] = await Promise.all([
      // Documents expiring within 30 days
      dbQuery(
        `SELECT citizen_doc_id, doc_type_id, original_filename, valid_until
         FROM citizen_document
         WHERE user_id = $1 AND is_current = true AND status = 'VALID'
           AND valid_until IS NOT NULL
           AND valid_until BETWEEN NOW() AND NOW() + INTERVAL '30 days'
         ORDER BY valid_until ASC`,
        [userId]
      ),
      // Applications where current task SLA has passed or is within 2 days
      dbQuery(
        `SELECT t.arn, a.public_arn, a.service_key, t.system_role_id, t.sla_due_at, t.created_at
         FROM task t
         JOIN application a ON t.arn = a.arn
         WHERE a.applicant_user_id = $1
           AND t.status IN ('PENDING', 'IN_PROGRESS')
           AND t.sla_due_at IS NOT NULL
           AND t.sla_due_at <= NOW() + INTERVAL '2 days'
         ORDER BY t.sla_due_at ASC`,
        [userId]
      ),
      applications.getUserPendingActions(userId),
    ]);

    return {
      expiringDocuments: expiringDocs.rows,
      stalledApplications: stalledApps.rows.map((r: any) => ({
        ...r,
        arn: r.public_arn || r.arn,
      })),
      queries: pendingActions.queries,
      documentRequests: pendingActions.documentRequests,
    };
  });

  // GET /api/v1/services/processing-stats — processing time stats
  app.get("/api/v1/services/processing-stats", async (request, reply) => {
    const { query: dbQuery } = await import("../db");

    const SERVICE_DISPLAY_NAME: Record<string, string> = {
      no_due_certificate: "No Due Certificate",
      registration_of_architect: "Architect Registration",
      sanction_of_water_supply: "Water Supply Connection",
      sanction_of_sewerage_connection: "Sewerage Connection",
    };
    const SERVICE_SLA_DAYS: Record<string, number> = {
      no_due_certificate: 5,
      registration_of_architect: 4,
      sanction_of_water_supply: 4,
      sanction_of_sewerage_connection: 4,
    };

    const result = await dbQuery(
      `SELECT
        a.service_key,
        COUNT(*)::int as total_completed,
        COALESCE(AVG(EXTRACT(EPOCH FROM (a.disposed_at - a.submitted_at)) / 86400)::int, 0) as avg_days,
        COALESCE((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (a.disposed_at - a.submitted_at))) / 86400)::int, 0) as p90_days,
        COUNT(*) FILTER (
          WHERE EXTRACT(EPOCH FROM (a.disposed_at - a.submitted_at)) / 86400 <=
            CASE a.service_key
              WHEN 'no_due_certificate' THEN 5
              WHEN 'registration_of_architect' THEN 4
              WHEN 'sanction_of_water_supply' THEN 4
              WHEN 'sanction_of_sewerage_connection' THEN 4
              ELSE 30
            END
        )::int as on_time_count
       FROM application a
       WHERE a.disposed_at IS NOT NULL
         AND a.submitted_at IS NOT NULL
         AND a.disposed_at > NOW() - INTERVAL '6 months'
       GROUP BY a.service_key`,
      []
    );

    const services = result.rows.map((row: any) => {
      const slaDays = SERVICE_SLA_DAYS[row.service_key] || 30;
      const totalCompleted = parseInt(row.total_completed) || 0;
      const onTimeCount = parseInt(row.on_time_count) || 0;
      const complianceRate = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 0;
      return {
        serviceKey: row.service_key,
        serviceName: SERVICE_DISPLAY_NAME[row.service_key] || row.service_key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
        avgDays: parseInt(row.avg_days) || 0,
        p90Days: parseInt(row.p90_days) || 0,
        totalCompleted,
        slaDays,
        complianceRate,
      };
    });

    return { services };
  });

  // POST /api/v1/applications/check-duplicate — duplicate detection
  app.post("/api/v1/applications/check-duplicate", {
    schema: {
      body: {
        type: "object",
        required: ["serviceKey"],
        additionalProperties: false,
        properties: {
          serviceKey: { type: "string", minLength: 1 },
          propertyUpn: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const body = request.body as { serviceKey: string; propertyUpn?: string };

    let propertyId: string | null = null;
    if (body.propertyUpn) {
      // Resolve UPN to property_id — try all authorities
      const prop = await getPropertyByUPN("PUDA", body.propertyUpn)
        || await getPropertyByUPN("GMADA", body.propertyUpn)
        || await getPropertyByUPN("GLADA", body.propertyUpn)
        || await getPropertyByUPN("BDA", body.propertyUpn);
      if (prop) {
        propertyId = prop.property_id;
      }
    }

    const existing = await applications.checkDuplicateApplication(
      userId,
      body.serviceKey,
      propertyId
    );

    return {
      hasDuplicate: existing.length > 0,
      existingApplications: existing.map((app) => ({
        arn: app.public_arn || app.arn,
        state_id: app.state_id,
        created_at: app.created_at,
      })),
    };
  });

  // GET /api/v1/applications/search — full-text search
  app.get("/api/v1/applications/search", { schema: applicationSearchSchema }, async (request, reply) => {
    const q = request.query as any;
    const scopedAuthorityId = await resolveBackofficeAuthorityScope(
      request,
      reply,
      q.authorityId,
      "search applications"
    );
    if (scopedAuthorityId === null) return;
    const apps = await applications.searchApplications(
      scopedAuthorityId,
      q.searchTerm,
      q.status,
      Math.min(parseInt(q.limit || "50", 10), 200),
      parseInt(q.offset || "0", 10)
    );
    return { applications: apps.map(toClientApplication) };
  });

  // GET /api/v1/applications/export — CSV/XLSX export
  app.get("/api/v1/applications/export", { schema: applicationExportSchema }, async (request, reply) => {
    const q = request.query as any;
    const scopedAuthorityId = await resolveBackofficeAuthorityScope(
      request,
      reply,
      q.authorityId,
      "export applications"
    );
    if (scopedAuthorityId === null) return;
    try {
      // PERF-003: Stream CSV to response
      const csvStream = await applications.exportApplicationsToCSV(
        scopedAuthorityId,
        q.searchTerm,
        q.status
      );
      reply.type("text/csv");
      reply.header("Content-Disposition", `attachment; filename="applications_${new Date().toISOString().split("T")[0]}.csv"`);
      return reply.send(csvStream);
    } catch (error: any) {
      reply.code(500);
      return { error: error.message, statusCode: 500 };
    }
  });
}
