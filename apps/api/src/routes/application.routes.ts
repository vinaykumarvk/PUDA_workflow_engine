import { FastifyInstance } from "fastify";
import * as applications from "../applications";
import * as documents from "../documents";
import * as outputs from "../outputs";
import * as notifications from "../notifications";
import * as ndcPaymentStatus from "../ndc-payment-status";
import { getPropertyByUPN } from "../properties";
import { getAuthUserId, send400, send403, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireAuthorityStaffAccess,
  requireCitizenOwnedApplicationAccess,
  requireValidAuthorityId,
} from "../route-access";

function toClientApplication(app: applications.Application) {
  return { ...app, arn: app.public_arn || app.arn, rowVersion: app.row_version };
}

const createAppSchema = {
  body: {
    type: "object",
    required: ["authorityId", "serviceKey"],
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      serviceKey: { type: "string", minLength: 1 },
      applicantUserId: { type: "string" },
      data: { type: "object" },
      submissionChannel: { type: "string" },
      assistedByUserId: { type: "string" },
    },
  },
};

const applicationWildcardParamsSchema = {
  type: "object",
  required: ["*"],
  additionalProperties: false,
  properties: {
    "*": { type: "string", minLength: 1 },
  },
};

const applicationListSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const userScopedReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const applicationSearchSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      searchTerm: { type: "string", minLength: 1 },
      status: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    },
  },
};

const applicationExportSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      searchTerm: { type: "string", minLength: 1 },
      status: { type: "string", minLength: 1 },
    },
  },
};

const notificationsReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      unreadOnly: { type: "string", enum: ["true", "false"] },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const updateAppSchema = {
  params: applicationWildcardParamsSchema,
  body: {
    type: "object",
    required: ["data"],
    additionalProperties: false,
    properties: {
      data: { type: "object" },
      rowVersion: { type: "integer", minimum: 0 },
      userId: { type: "string" }, // test-mode fallback only
    },
  },
};

const markNotificationReadSchema = {
  params: {
    type: "object",
    required: ["notificationId"],
    additionalProperties: false,
    properties: {
      notificationId: { type: "string", minLength: 1 },
    },
  },
  body: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      { type: "null" },
    ],
  },
};

const applicationActionSchema = {
  params: applicationWildcardParamsSchema,
  body: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          queryId: { type: "string", minLength: 1 },
          responseMessage: { type: "string", minLength: 1 },
          updatedData: { type: "object" },
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["dueCode"],
        properties: {
          dueCode: { type: "string", minLength: 1 },
          paymentDate: { type: "string", minLength: 1 },
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      { type: "null" },
    ],
  },
};

type QueryResponseRequestBody = {
  queryId: string;
  responseMessage: string;
  updatedData?: Record<string, unknown>;
};

/**
 * M8: Helper to extract ARN from wildcard param.
 * ARNs contain slashes (e.g. PUDA/NDC/2026/000001) so we use Fastify wildcard routes.
 */
function arnFromWildcard(request: any): string {
  const params = request.params as Record<string, string | undefined>;
  return (params["*"] ?? "").replace(/^\//, "");
}

function parseQueryResponseBody(reply: any, rawBody: unknown): QueryResponseRequestBody | null {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    reply.send(
      send400(reply, "INVALID_REQUEST_BODY", "Body must be an object")
    );
    return null;
  }
  const body = rawBody as Record<string, unknown>;
  const allowedKeys = new Set(["queryId", "responseMessage", "updatedData", "userId"]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    reply.send(
      send400(
        reply,
        "INVALID_REQUEST_BODY",
        `Unexpected field(s): ${unknownKeys.join(", ")}`
      )
    );
    return null;
  }
  if (typeof body.queryId !== "string" || !body.queryId.trim()) {
    reply.send(send400(reply, "QUERY_ID_REQUIRED", "queryId is required"));
    return null;
  }
  if (typeof body.responseMessage !== "string" || !body.responseMessage.trim()) {
    reply.send(
      send400(reply, "RESPONSE_MESSAGE_REQUIRED", "responseMessage is required")
    );
    return null;
  }
  if (
    body.updatedData !== undefined &&
    (typeof body.updatedData !== "object" ||
      body.updatedData === null ||
      Array.isArray(body.updatedData))
  ) {
    reply.send(
      send400(reply, "INVALID_REQUEST_BODY", "updatedData must be an object")
    );
    return null;
  }
  return {
    queryId: body.queryId,
    responseMessage: body.responseMessage,
    updatedData: body.updatedData as Record<string, unknown> | undefined,
  };
}

async function resolveBackofficeAuthorityScope(
  request: any,
  reply: any,
  requestedAuthorityId: string | undefined,
  actionDescription: string
): Promise<string | undefined | null> {
  if (requestedAuthorityId) {
    const validAuthority = await requireValidAuthorityId(reply, requestedAuthorityId);
    if (!validAuthority) return null;
  }

  const userType = request.authUser?.userType;
  if (userType === "ADMIN") {
    return requestedAuthorityId;
  }

  if (userType !== "OFFICER") {
    reply.send(
      send403(
        reply,
        "FORBIDDEN",
        `Only officers and admins can ${actionDescription}`
      )
    );
    return null;
  }

  if (requestedAuthorityId) {
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      requestedAuthorityId,
      `You are not allowed to ${actionDescription} in this authority`
    );
    if (!allowed) return null;
    return requestedAuthorityId;
  }

  const postingAuthorities = Array.from(
    new Set(
      ((request.authUser?.postings || []) as Array<{ authority_id?: string }>)
        .map((posting) => posting.authority_id)
        .filter((authorityId): authorityId is string => Boolean(authorityId))
    )
  );

  if (postingAuthorities.length === 1) {
    return postingAuthorities[0];
  }
  if (postingAuthorities.length === 0) {
    reply.send(
      send403(
        reply,
        "FORBIDDEN",
        `You are not posted to any authority and cannot ${actionDescription}`
      )
    );
    return null;
  }
  reply.send(
    send400(
      reply,
      "AUTHORITY_ID_REQUIRED",
      "authorityId query parameter is required when officer has access to multiple authorities"
    )
  );
  return null;
}

export async function registerApplicationRoutes(app: FastifyInstance) {
  // --- Collection routes (no ARN in path) ---
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

  app.get("/api/v1/applications", { schema: applicationListSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const q = request.query as any;
    const limit = Math.min(parseInt(q.limit || "50", 10), 200);
    const offset = parseInt(q.offset || "0", 10);
    const apps = await applications.getUserApplications(userId, q.status, limit, offset);
    return { applications: apps.map(toClientApplication) };
  });

  app.get("/api/v1/applications/stats", { schema: userScopedReadSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    return applications.getUserApplicationStats(userId);
  });

  app.get("/api/v1/applications/pending-actions", { schema: userScopedReadSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    return applications.getUserPendingActions(userId);
  });

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
      const csv = await applications.exportApplicationsToCSV(
        scopedAuthorityId,
        q.searchTerm,
        q.status
      );
      reply.type("text/csv");
      reply.header("Content-Disposition", `attachment; filename="applications_${new Date().toISOString().split("T")[0]}.csv"`);
      return csv;
    } catch (error: any) {
      reply.code(500);
      return { error: error.message, statusCode: 500 };
    }
  });

  // --- Notification routes ---
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

  // --- M8: Wildcard routes for ARN-based operations ---
  // Fastify matches routes in registration order. The wildcard captures the entire ARN path.
  // We use separate POST/PUT/GET wildcards with explicit suffix detection for clarity.

  app.put("/api/v1/applications/*", { schema: updateAppSchema }, async (request, reply) => {
    const rawArn = arnFromWildcard(request);
    if (!rawArn) return send400(reply, "ARN_REQUIRED");

    const internalArn = await requireCitizenOwnedApplicationAccess(
      request,
      reply,
      rawArn,
      "You are not allowed to update this application"
    );
    if (!internalArn) return;

    const userId = request.authUser?.userId || getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const body = request.body as { data: any; rowVersion?: number };
    try {
      const application = await applications.updateApplicationData(
        internalArn,
        body.data,
        userId,
        body.rowVersion,
        request.authUser?.userType || "CITIZEN"
      );
      return toClientApplication(application);
    } catch (error: any) {
      if (error.message === "CONFLICT") {
        reply.code(409);
        return { error: "CONFLICT", statusCode: 409, message: "Application was modified by another user. Please reload and retry." };
      }
      if (error.message === "FORBIDDEN") {
        return send403(reply, "FORBIDDEN", "You are not allowed to update this application");
      }
      return send400(reply, error.message);
    }
  });

  // M8: POST wildcard — handles submit and query-response via suffix
  // This is required because ARNs contain slashes, making parameterized routes impractical.
  app.post("/api/v1/applications/*", { schema: applicationActionSchema }, async (request, reply) => {
    const raw = arnFromWildcard(request);
    const userId = request.authUser?.userId || getAuthUserId(request, "userId");

    // Dispatch based on known suffixes
    if (raw.endsWith("/pay-due")) {
      const arn = raw.slice(0, -"/pay-due".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to post payment for this application"
      );
      if (!internalArn) return;

      const application = await applications.getApplication(internalArn);
      if (!application) return send404(reply, "APPLICATION_NOT_FOUND");
      if (application.service_key !== "no_due_certificate") {
        return send400(
          reply,
          "PAYMENT_POST_UNSUPPORTED",
          "Direct due payment posting is currently available for No Due Certificate only"
        );
      }

      const body = request.body as { dueCode?: string; paymentDate?: string };
      if (!body?.dueCode || typeof body.dueCode !== "string") {
        return send400(reply, "DUE_CODE_REQUIRED", "dueCode is required");
      }
      try {
        const result = await ndcPaymentStatus.postNdcPaymentForApplication(internalArn, {
          dueCode: body.dueCode,
          paymentDate: body.paymentDate,
        });
        return {
          success: true,
          paymentPosted: result.paymentPosted,
          paymentStatus: result.paymentStatus,
        };
      } catch (error: any) {
        if (error.message === "PROPERTY_NOT_FOUND") {
          return send404(reply, "PROPERTY_NOT_FOUND", "Linked property details are unavailable");
        }
        if (error.message === "DUE_ALREADY_PAID") {
          reply.code(409);
          return { error: "DUE_ALREADY_PAID", message: "Selected due is already paid" };
        }
        if (error.message === "DUE_NOT_FOUND") {
          return send400(reply, "DUE_NOT_FOUND", "Unknown or inapplicable dueCode for this property");
        }
        if (error.message === "INVALID_PAYMENT_DATE") {
          return send400(reply, "INVALID_PAYMENT_DATE", "paymentDate must be in YYYY-MM-DD format");
        }
        return send400(reply, error.message || "PAYMENT_POST_FAILED");
      }
    }

    if (raw.endsWith("/submit")) {
      const arn = raw.slice(0, -"/submit".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to submit this application"
      );
      if (!internalArn) return;
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      try {
        return await applications.submitApplication(
          internalArn,
          userId,
          request.authUser?.userType || "CITIZEN"
        );
      } catch (error: any) {
        if (error.message === "FORBIDDEN") {
          return send403(reply, "FORBIDDEN", "You are not allowed to submit this application");
        }
        return send400(reply, error.message);
      }
    }

    if (raw.endsWith("/query-response")) {
      const arn = raw.slice(0, -"/query-response".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to respond to this query"
      );
      if (!internalArn) return;
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const body = parseQueryResponseBody(reply, request.body);
      if (!body) return;
      try {
        await applications.respondToQuery(
          internalArn,
          body.queryId,
          body.responseMessage,
          body.updatedData || {},
          userId,
          request.authUser?.userType || "CITIZEN"
        );
        return { success: true };
      } catch (error: any) {
        if (error.message === "FORBIDDEN") {
          return send403(reply, "FORBIDDEN", "You are not allowed to respond to this query");
        }
        return send400(reply, error.message);
      }
    }

    return send404(reply, "NOT_FOUND", "Unknown application action");
  });

  // M8: GET wildcard — handles detail, output metadata, and output download via suffix
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
      dbQuery("SELECT task_id, state_id, system_role_id, status, sla_due_at, created_at, completed_at, decision, remarks FROM task WHERE arn = $1 ORDER BY created_at DESC", [internalArn]),
      dbQuery("SELECT event_type, actor_type, actor_id, payload_jsonb, created_at FROM audit_event WHERE arn = $1 ORDER BY created_at DESC LIMIT 50", [internalArn]),
    ]);
    return {
      ...toClientApplication(application),
      documents: docs,
      queries: queriesResult.rows,
      tasks: tasksResult.rows,
      timeline: auditResult.rows,
    };
  });
}
