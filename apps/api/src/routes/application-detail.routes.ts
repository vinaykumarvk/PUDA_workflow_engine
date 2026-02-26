import { FastifyInstance } from "fastify";
import * as applications from "../applications";
import * as documents from "../documents";
import * as outputs from "../outputs";
import * as notifications from "../notifications";
import * as ndcPaymentStatus from "../ndc-payment-status";
import { getAuthUserId, send400, send404 } from "../errors";
import { requireApplicationReadAccess } from "../route-access";
import {
  toClientApplication,
  arnFromWildcard,
  notificationsReadSchema,
  markNotificationReadSchema,
  applicationWildcardParamsSchema,
} from "./application.routes";

export async function registerApplicationDetailRoutes(app: FastifyInstance) {
  // --- Notification routes ---

  // GET /api/v1/notifications — list user's notifications
  app.get("/api/v1/notifications", { schema: notificationsReadSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const q = request.query as any;
    const limit = Math.min(parseInt(q.limit || "20", 10), 200);
    const offset = parseInt(q.offset || "0", 10);
    const notifs = await notifications.getUserNotifications(
      userId,
      limit,
      offset,
      q.unreadOnly === "true"
    );
    return { notifications: notifs };
  });

  // PUT /api/v1/notifications/:notificationId/read — mark notification read
  app.put(
    "/api/v1/notifications/:notificationId/read",
    { schema: markNotificationReadSchema },
    async (request, reply) => {
    const params = request.params as { notificationId: string };
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    await notifications.markNotificationRead(params.notificationId, userId);
    return { success: true };
    }
  );

  // --- M8: GET wildcard — detail views, output metadata, output download, payment-status, doc-suggestions ---
  app.get("/api/v1/applications/*", { schema: { params: applicationWildcardParamsSchema } }, async (request, reply) => {
    const raw = arnFromWildcard(request);

    if (raw.endsWith("/payment-status")) {
      const arn = raw.slice(0, -"/payment-status".length);
      const internalArn = await requireApplicationReadAccess(
        request,
        reply,
        arn,
        "You are not allowed to access this application"
      );
      if (!internalArn) return;

      const application = await applications.getApplication(internalArn);
      if (!application) return send404(reply, "APPLICATION_NOT_FOUND");
      if (application.service_key !== "no_due_certificate") {
        return send400(
          reply,
          "PAYMENT_STATUS_UNSUPPORTED",
          "Payment status ledger is currently available for No Due Certificate only"
        );
      }

      const status = await ndcPaymentStatus.getNdcPaymentStatusForApplication(internalArn);
      if (!status) {
        return send404(reply, "PROPERTY_NOT_FOUND", "Linked property details are unavailable");
      }
      return { arn: application.public_arn || application.arn, paymentStatus: status };
    }

    // Doc-suggestions: find matching locker documents for this application's requirements
    if (raw.endsWith("/doc-suggestions")) {
      const arn = raw.slice(0, -"/doc-suggestions".length);
      const internalArn = await requireApplicationReadAccess(request, reply, arn, "You are not allowed to access this application");
      if (!internalArn) return;
      const application = await applications.getApplication(internalArn);
      if (!application) return send404(reply, "APPLICATION_NOT_FOUND");

      try {
        const { query: docSugQuery } = await import("../db");
        const configResult = await docSugQuery(
          "SELECT config_jsonb FROM service_version WHERE service_key = $1 AND version = $2",
          [application.service_key, application.service_version]
        );
        const config = configResult.rows[0]?.config_jsonb;
        const requiredDocTypes: string[] = (config?.documents?.documentTypes || []).map((dt: any) => dt.docTypeId);
        if (requiredDocTypes.length === 0) return { suggestions: [] };

        const userId = request.authUser?.userId;
        if (!userId) return { suggestions: [] };

        // Find matching VALID current documents in citizen's locker
        const locker = await docSugQuery(
          `SELECT cd.citizen_doc_id, cd.doc_type_id, cd.original_filename, cd.status, cd.valid_until
           FROM citizen_document cd
           WHERE cd.user_id = $1 AND cd.is_current = true AND cd.status = 'VALID'
             AND cd.doc_type_id = ANY($2)`,
          [userId, requiredDocTypes]
        );

        // Check which are already attached
        const attached = await docSugQuery(
          `SELECT ad.citizen_doc_id FROM application_document ad WHERE ad.arn = $1 AND ad.is_current = true`,
          [internalArn]
        );
        const attachedSet = new Set(attached.rows.map((r: any) => r.citizen_doc_id));

        const suggestions = locker.rows.map((doc: any) => ({
          doc_type_id: doc.doc_type_id,
          citizen_doc_id: doc.citizen_doc_id,
          original_filename: doc.original_filename,
          status: doc.status,
          valid_until: doc.valid_until,
          already_attached: attachedSet.has(doc.citizen_doc_id),
        }));

        return { suggestions };
      } catch {
        return { suggestions: [] };
      }
    }

    if (raw.endsWith("/output/download")) {
      const arn = raw.slice(0, -"/output/download".length);
      const internalArn = await requireApplicationReadAccess(
        request,
        reply,
        arn,
        "You are not allowed to access this application"
      );
      if (!internalArn) return;

      const application = await applications.getApplication(internalArn);
      if (!application) return send404(reply, "APPLICATION_NOT_FOUND");

      if (application.service_key === "no_due_certificate") {
        const status = await ndcPaymentStatus.getNdcPaymentStatusForApplication(internalArn);
        if (!status) {
          return send404(reply, "PROPERTY_NOT_FOUND", "Linked property details are unavailable");
        }
        const existingOutput = await outputs.getOutputByArn(internalArn);
        if (!existingOutput && !status.allDuesPaid) {
          reply.code(409);
          return {
            error: "DUES_PENDING",
            message: "Pending dues exist. Complete payment before downloading No Due Certificate.",
            paymentStatus: status,
          };
        }
        if (!existingOutput && application.disposal_type !== "REJECTED") {
          const outputRecord = await outputs.generateOutput(internalArn, "ndc_approval", application.service_key);
          // Issue document to citizen's locker
          try {
            if (application.applicant_user_id && outputRecord.storage_key) {
              const basename = outputRecord.storage_key.split("/").pop() || "certificate.pdf";
              await documents.issueCitizenDocument(
                application.applicant_user_id,
                `output_${application.service_key}`,
                outputRecord.storage_key,
                basename,
                "application/pdf",
                0,
                application.public_arn || application.arn,
                outputRecord.valid_from ? outputRecord.valid_from.toISOString().split("T")[0] : null,
                outputRecord.valid_to ? outputRecord.valid_to.toISOString().split("T")[0] : null
              );
            }
          } catch (e) { request.log.warn(e, "Issuing document to locker failed"); }
        }
      }

      const file = await outputs.getOutputFileByArn(internalArn);
      if (!file) return send404(reply, "OUTPUT_NOT_FOUND");
      reply.type(file.mimeType);
      return file.buffer;
    }

    if (raw.endsWith("/output")) {
      const arn = raw.slice(0, -"/output".length);
      const internalArn = await requireApplicationReadAccess(
        request,
        reply,
        arn,
        "You are not allowed to access this application"
      );
      if (!internalArn) return;
      const out = await outputs.getOutputByArn(internalArn);
      if (!out) return send404(reply, "OUTPUT_NOT_FOUND");
      const appRecord = await applications.getApplication(internalArn);
      return { ...out, arn: appRecord?.public_arn || appRecord?.arn || out.arn };
    }

    // Default: application detail
    const internalArn = await requireApplicationReadAccess(
      request,
      reply,
      raw,
      "You are not allowed to access this application"
    );
    if (!internalArn) return;
    const application = await applications.getApplication(internalArn);
    if (!application) return send404(reply, "APPLICATION_NOT_FOUND");
    const { query: dbQuery } = await import("../db");
    const [docs, queriesResult, tasksResult, auditResult] = await Promise.all([
      documents.getApplicationDocuments(internalArn),
      dbQuery("SELECT query_id, query_number, message, status, raised_at, response_due_at, responded_at, response_remarks, unlocked_field_keys, unlocked_doc_type_ids FROM query WHERE arn = $1 ORDER BY query_number DESC", [internalArn]),
      dbQuery("SELECT task_id, state_id, system_role_id, status, assignee_user_id, sla_due_at, created_at, completed_at, decision, remarks FROM task WHERE arn = $1 ORDER BY created_at DESC", [internalArn]),
      dbQuery("SELECT ae.event_type, ae.actor_type, ae.actor_id, u.name as actor_name, ae.payload_jsonb, ae.created_at FROM audit_event ae LEFT JOIN \"user\" u ON ae.actor_id = u.user_id WHERE ae.arn = $1 ORDER BY ae.created_at DESC LIMIT 50", [internalArn]),
    ]);

    // Build workflow_stages for predictive timeline
    let workflowStages: any[] = [];
    let currentHandler: any = null;
    try {
      const configResult = await dbQuery(
        "SELECT config_jsonb FROM service_version WHERE service_key = $1 AND version = $2",
        [application.service_key, application.service_version]
      );
      if (configResult.rows.length > 0) {
        const config = configResult.rows[0].config_jsonb;
        const workflow = config?.workflow;
        if (workflow?.states) {
          const taskStates = workflow.states.filter((s: any) => s.type === "TASK" && s.taskRequired);
          const tasks = tasksResult.rows;
          workflowStages = taskStates.map((state: any) => {
            const completedTask = tasks.find((t: any) => t.state_id === state.stateId && t.status === "COMPLETED");
            const currentTask = tasks.find((t: any) => t.state_id === state.stateId && (t.status === "PENDING" || t.status === "IN_PROGRESS"));
            let status: "completed" | "current" | "upcoming" = "upcoming";
            if (completedTask) status = "completed";
            else if (currentTask || application.state_id === state.stateId) status = "current";
            return {
              stateId: state.stateId,
              systemRoleId: state.systemRoleId || null,
              slaDays: state.slaDays || null,
              status,
              enteredAt: completedTask?.created_at || currentTask?.created_at || null,
              completedAt: completedTask?.completed_at || null,
            };
          });
        }
      }

      // Build current_handler from the current PENDING/IN_PROGRESS task
      const currentTask = tasksResult.rows.find((t: any) => t.status === "PENDING" || t.status === "IN_PROGRESS");
      if (currentTask) {
        let officerName: string | undefined;
        if (currentTask.assignee_user_id) {
          const userResult = await dbQuery("SELECT name FROM \"user\" WHERE user_id = $1", [currentTask.assignee_user_id]);
          officerName = userResult.rows[0]?.name;
        }
        const daysInStage = Math.floor((Date.now() - new Date(currentTask.created_at).getTime()) / (1000 * 60 * 60 * 24));
        currentHandler = {
          officer_name: officerName || undefined,
          role_id: currentTask.system_role_id,
          sla_due_at: currentTask.sla_due_at || null,
          days_in_stage: daysInStage,
          since: currentTask.created_at,
        };
      }
    } catch {
      // Non-blocking: continue without enrichment
    }

    return {
      ...toClientApplication(application),
      documents: docs,
      queries: queriesResult.rows,
      tasks: tasksResult.rows,
      timeline: auditResult.rows,
      workflow_stages: workflowStages,
      current_handler: currentHandler,
    };
  });
}
