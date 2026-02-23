/**
 * Communications API routes.
 *
 * Provides endpoints for:
 * - Notification delivery logs (multi-channel audit trail)
 * - Notice letters (formal notices/letters for queries, decisions, etc.)
 * - Enhanced query information
 */
import { FastifyInstance } from "fastify";
import {
  getLogsForApplication,
  getLogsForUser,
  getDeliveryStats,
} from "../notification-log";
import {
  getNoticeById,
  getNoticesForApplication,
  getNoticeForQuery,
  getNoticesForDecision,
  createNoticeLetter,
  markDispatched,
} from "../notices";
import type { NoticeType, DispatchMode } from "../notices";
import { getAuthUserId, send400, send403, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireAuthorityStaffAccess,
  requireApplicationStaffMutationAccess,
} from "../route-access";
import { query } from "../db";

const createNoticeSchema = {
  body: {
    type: "object",
    required: ["arn", "noticeType"],
    additionalProperties: false,
    properties: {
      arn: { type: "string", minLength: 1 },
      noticeType: {
        type: "string",
        enum: ["QUERY", "DEFICIENCY", "APPROVAL", "REJECTION", "DEMAND_LETTER", "OTHER"],
      },
      templateCode: { type: "string" },
      subject: { type: "string" },
      bodyText: { type: "string" },
      dispatchMode: { type: "string", enum: ["ELECTRONIC", "PHYSICAL"] },
      dispatchAddress: { type: "object" },
      queryId: { type: "string" },
      decisionId: { type: "string" },
      issuedByRole: { type: "string" },
      metadata: { type: "object" },
    },
  },
};

const dispatchNoticeSchema = {
  params: {
    type: "object",
    required: ["noticeId"],
    additionalProperties: false,
    properties: {
      noticeId: { type: "string", minLength: 1 },
    },
  },
  body: {
    type: "object",
    required: ["dispatchMode"],
    additionalProperties: false,
    properties: {
      dispatchMode: { type: "string", enum: ["ELECTRONIC", "PHYSICAL"] },
    },
  },
};

const arnWildcardParamsSchema = {
  type: "object",
  required: ["*"],
  additionalProperties: false,
  properties: {
    "*": { type: "string", minLength: 1 },
  },
};

const notificationLogsForApplicationSchema = {
  params: arnWildcardParamsSchema,
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      channel: { type: "string", enum: ["SMS", "EMAIL", "IN_APP"] },
    },
  },
};

const notificationLogsMyLogsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const notificationStatsSchema = {
  params: arnWildcardParamsSchema,
};

const noticesForApplicationSchema = {
  params: arnWildcardParamsSchema,
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        type: "string",
        enum: ["QUERY", "DEFICIENCY", "APPROVAL", "REJECTION", "DEMAND_LETTER", "OTHER"],
      },
    },
  },
};

const noticeIdParamsSchema = {
  params: {
    type: "object",
    required: ["noticeId"],
    additionalProperties: false,
    properties: {
      noticeId: { type: "string", minLength: 1 },
    },
  },
};

const queryIdParamsSchema = {
  params: {
    type: "object",
    required: ["queryId"],
    additionalProperties: false,
    properties: {
      queryId: { type: "string", minLength: 1 },
    },
  },
};

const decisionIdParamsSchema = {
  params: {
    type: "object",
    required: ["decisionId"],
    additionalProperties: false,
    properties: {
      decisionId: { type: "string", minLength: 1 },
    },
  },
};

const queriesForApplicationSchema = {
  params: arnWildcardParamsSchema,
};

export async function registerCommunicationRoutes(app: FastifyInstance) {
  // =======================================================================
  // NOTIFICATION DELIVERY LOGS
  // =======================================================================

  /**
   * GET /api/v1/notification-logs/for-application/*?channel=SMS|EMAIL|IN_APP
   * All notification delivery logs for an application.
   */
  app.get(
    "/api/v1/notification-logs/for-application/*",
    { schema: notificationLogsForApplicationSchema },
    async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access notification logs for this application"
    );
    if (!arn) return;

    const qs = request.query as Record<string, string | undefined>;
    const channel = qs.channel as any;
    const logs = await getLogsForApplication(arn, channel);
    return { logs };
    }
  );

  /**
   * GET /api/v1/notification-logs/my-logs?userId=...&limit=50&offset=0
   * Current user's notification delivery history.
   */
  app.get(
    "/api/v1/notification-logs/my-logs",
    { schema: notificationLogsMyLogsSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const qs = request.query as Record<string, string | undefined>;
    const limit = Math.min(parseInt(qs.limit || "50", 10), 200);
    const offset = parseInt(qs.offset || "0", 10);
    let scopedAuthorityIds: string[] | undefined;

    if (request.authUser?.userType === "OFFICER") {
      const officerAuthorityIds = Array.from(
        new Set(
          (request.authUser.postings || [])
            .map((posting) => posting.authority_id)
            .filter((authorityId): authorityId is string => Boolean(authorityId))
        )
      );
      if (!qs.authorityId && officerAuthorityIds.length > 1) {
        return send400(
          reply,
          "AUTHORITY_ID_REQUIRED",
          "authorityId query parameter is required when officer has access to multiple authorities"
        );
      }
      if (qs.authorityId) {
        const allowed = requireAuthorityStaffAccess(
          request,
          reply,
          qs.authorityId,
          "You are not allowed to access notification logs in this authority"
        );
        if (!allowed) return;
        scopedAuthorityIds = [qs.authorityId];
      } else {
        scopedAuthorityIds = officerAuthorityIds;
        if (scopedAuthorityIds.length === 0) {
          return reply.send(
            send403(reply, "FORBIDDEN", "You are not posted to any authority")
          );
        }
      }
    }

    const logs = await getLogsForUser(userId, limit, offset, scopedAuthorityIds);
    return { logs };
    }
  );

  /**
   * GET /api/v1/notification-logs/stats/*
   * Delivery statistics for an application (count by channel + status).
   */
  app.get(
    "/api/v1/notification-logs/stats/*",
    { schema: notificationStatsSchema },
    async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access notification stats for this application"
    );
    if (!arn) return;

    const stats = await getDeliveryStats(arn);
    return { stats };
    }
  );

  // =======================================================================
  // NOTICE LETTERS
  // =======================================================================

  /**
   * GET /api/v1/notices/for-application/*?type=QUERY|DEFICIENCY|APPROVAL|REJECTION|DEMAND_LETTER|OTHER
   * All notice letters for an application.
   */
  app.get(
    "/api/v1/notices/for-application/*",
    { schema: noticesForApplicationSchema },
    async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access notices for this application"
    );
    if (!arn) return;

    const qs = request.query as Record<string, string | undefined>;
    const noticeType = qs.type as NoticeType | undefined;
    const notices = await getNoticesForApplication(arn, noticeType);
    return { notices };
    }
  );

  /**
   * GET /api/v1/notices/:noticeId
   * Get a specific notice letter.
   */
  app.get("/api/v1/notices/:noticeId", { schema: noticeIdParamsSchema }, async (request, reply) => {
    const { noticeId } = request.params as { noticeId: string };
    const notice = await getNoticeById(noticeId);
    if (!notice) return send404(reply, "Notice not found");
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      notice.arn,
      "You are not allowed to access this notice"
    );
    if (!arn) return;
    return { notice };
  });

  /**
   * GET /api/v1/notices/for-query/:queryId
   * Get the notice linked to a specific query.
   */
  app.get("/api/v1/notices/for-query/:queryId", { schema: queryIdParamsSchema }, async (request, reply) => {
    const { queryId } = request.params as { queryId: string };
    const notice = await getNoticeForQuery(queryId);
    if (!notice) {
      return { notice: null, message: "No notice linked to this query" };
    }
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      notice.arn,
      "You are not allowed to access this notice"
    );
    if (!arn) return;
    return { notice };
  });

  /**
   * GET /api/v1/notices/for-decision/:decisionId
   * Get notices linked to a specific decision.
   */
  app.get("/api/v1/notices/for-decision/:decisionId", { schema: decisionIdParamsSchema }, async (request, reply) => {
    const { decisionId } = request.params as { decisionId: string };
    const notices = await getNoticesForDecision(decisionId);
    const uniqueArns = [...new Set(notices.map((notice) => notice.arn))];
    for (const arn of uniqueArns) {
      const accessArn = await requireApplicationReadAccess(
        request,
        reply,
        arn,
        "You are not allowed to access notices for this decision"
      );
      if (!accessArn) return;
    }
    return { notices };
  });

  /**
   * POST /api/v1/notices — manually create a notice letter
   * Body: { arn, noticeType, subject?, bodyText?, dispatchMode?, ... }
   */
  app.post("/api/v1/notices", { schema: createNoticeSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const body = request.body as Record<string, unknown>;
    const arn = body.arn as string | undefined;
    const noticeType = body.noticeType as NoticeType | undefined;

    if (!arn || !noticeType) {
      return send400(reply, "arn and noticeType are required");
    }

    const resolvedArn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      arn,
      "You are not allowed to create notices for this application"
    );
    if (!resolvedArn) return;

    const notice = await createNoticeLetter({
      arn: resolvedArn,
      noticeType,
      templateCode: body.templateCode as string | undefined,
      subject: body.subject as string | undefined,
      bodyText: body.bodyText as string | undefined,
      dispatchMode: body.dispatchMode as DispatchMode | undefined,
      dispatchAddress: body.dispatchAddress as Record<string, unknown> | undefined,
      queryId: body.queryId as string | undefined,
      decisionId: body.decisionId as string | undefined,
      issuedByUserId: userId,
      issuedByRole: body.issuedByRole as string | undefined,
      metadata: body.metadata as Record<string, unknown> | undefined,
    });

    reply.code(201);
    return { notice };
  });

  /**
   * PATCH /api/v1/notices/:noticeId/dispatch
   * Mark a notice as dispatched.
   */
  app.patch(
    "/api/v1/notices/:noticeId/dispatch",
    { schema: dispatchNoticeSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const { noticeId } = request.params as { noticeId: string };
    const body = request.body as Record<string, unknown>;
    const dispatchMode = body.dispatchMode as DispatchMode | undefined;
    const existing = await getNoticeById(noticeId);
    if (!existing) return send404(reply, "Notice not found or already dispatched");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to dispatch this notice"
    );
    if (!arn) return;

    const notice = await markDispatched(noticeId, dispatchMode);
    if (!notice) return send404(reply, "Notice not found or already dispatched");
    return { notice };
    }
  );

  // =======================================================================
  // ENHANCED QUERIES
  // =======================================================================

  /**
   * GET /api/v1/queries/for-application/*
   * All queries for an application with full details including who raised them.
   */
  app.get(
    "/api/v1/queries/for-application/*",
    { schema: queriesForApplicationSchema },
    async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access queries for this application"
    );
    if (!arn) return;

    const result = await query(
      `SELECT q.*,
              u.name as raised_by_name
       FROM query q
       LEFT JOIN "user" u ON u.user_id = q.raised_by_user_id
       WHERE q.arn = $1
       ORDER BY q.query_number DESC`,
      [arn]
    );

    const queries = result.rows.map((row: any) => ({
      query_id: row.query_id,
      arn: row.arn,
      query_number: row.query_number,
      message: row.message,
      status: row.status,
      unlocked_field_keys: row.unlocked_field_keys || [],
      unlocked_doc_type_ids: row.unlocked_doc_type_ids || [],
      raised_at: row.raised_at,
      response_due_at: row.response_due_at,
      responded_at: row.responded_at,
      response_remarks: row.response_remarks,
      raised_by_user_id: row.raised_by_user_id,
      raised_by_role: row.raised_by_role,
      raised_by_name: row.raised_by_name,
    }));

    return { queries };
    }
  );

  /**
   * GET /api/v1/queries/:queryId
   * Get a specific query with its notice.
   */
  app.get("/api/v1/queries/:queryId", { schema: queryIdParamsSchema }, async (request, reply) => {
    const { queryId } = request.params as { queryId: string };

    const result = await query(
      `SELECT q.*,
              u.name as raised_by_name
       FROM query q
       LEFT JOIN "user" u ON u.user_id = q.raised_by_user_id
       WHERE q.query_id = $1`,
      [queryId]
    );

    if (result.rows.length === 0) return send404(reply, "Query not found");

    const row = result.rows[0];
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      row.arn,
      "You are not allowed to access this query"
    );
    if (!arn) return;
    const notice = await getNoticeForQuery(queryId);

    return {
      query: {
        query_id: row.query_id,
        arn: row.arn,
        query_number: row.query_number,
        message: row.message,
        status: row.status,
        unlocked_field_keys: row.unlocked_field_keys || [],
        unlocked_doc_type_ids: row.unlocked_doc_type_ids || [],
        raised_at: row.raised_at,
        response_due_at: row.response_due_at,
        responded_at: row.responded_at,
        response_remarks: row.response_remarks,
        raised_by_user_id: row.raised_by_user_id,
        raised_by_role: row.raised_by_role,
        raised_by_name: row.raised_by_name,
      },
      notice,
    };
  });
}
