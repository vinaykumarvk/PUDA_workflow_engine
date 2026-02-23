/**
 * Inspection API routes.
 *
 * Provides endpoints for:
 * - Listing inspections for an application
 * - Officer inspection queue (my pending inspections)
 * - Getting inspection details
 * - Assigning an officer to an inspection
 * - Completing an inspection with findings
 * - Cancelling an inspection
 * - Getting the inspection linked to a task
 */
import { FastifyInstance } from "fastify";
import {
  getInspectionById,
  getInspectionsForApplication,
  getInspectionForTask,
  getOfficerInspectionQueue,
  assignInspection,
  completeInspection,
  cancelInspection,
  createInspection,
} from "../inspections";
import type { InspectionOutcome, CompleteInspectionInput } from "../inspections";
import { getAuthUserId, send400, send403, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireAuthorityStaffAccess,
  requireApplicationStaffMutationAccess,
} from "../route-access";

const createInspectionSchema = {
  body: {
    type: "object",
    required: ["arn", "inspectionType"],
    additionalProperties: false,
    properties: {
      arn: { type: "string", minLength: 1 },
      taskId: { type: "string" },
      inspectionType: { type: "string", minLength: 1 },
      scheduledAt: { type: "string" },
      officerUserId: { type: "string" },
      officerRoleId: { type: "string" },
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

const taskIdParamsSchema = {
  type: "object",
  required: ["taskId"],
  additionalProperties: false,
  properties: {
    taskId: { type: "string", minLength: 1 },
  },
};

const inspectionIdParamsSchema = {
  type: "object",
  required: ["inspectionId"],
  additionalProperties: false,
  properties: {
    inspectionId: { type: "string", minLength: 1 },
  },
};

const inspectionQueueSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      includeCompleted: { type: "string", enum: ["true", "false"] },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const assignInspectionSchema = {
  params: inspectionIdParamsSchema,
  body: {
    type: "object",
    required: ["officerUserId"],
    additionalProperties: false,
    properties: {
      officerUserId: { type: "string", minLength: 1 },
      officerRoleId: { type: "string" },
    },
  },
};

const completeInspectionSchema = {
  params: inspectionIdParamsSchema,
  body: {
    type: "object",
    required: ["outcome"],
    additionalProperties: false,
    properties: {
      outcome: {
        type: "string",
        enum: ["PASS", "FAIL", "REINSPECTION_REQUIRED", "NA"],
      },
      actualAt: { type: "string" },
      findingsSummary: { type: "string" },
      checklistData: { type: "object" },
      observations: { type: "object" },
      photos: { type: "array", items: {} },
      outcomeRemarks: { type: "string" },
    },
  },
};

const inspectionCancelSchema = {
  params: inspectionIdParamsSchema,
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

export async function registerInspectionRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // GET /api/v1/inspections/my-queue?userId=...&includeCompleted=false&authorityId=...
  // Officer's inspection queue — inspections assigned to the current officer
  // -----------------------------------------------------------------------
  app.get("/api/v1/inspections/my-queue", { schema: inspectionQueueSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) {
      reply.code(401);
      return { error: "Authentication required" };
    }
    if (request.authUser?.userType === "CITIZEN") {
      return send403(reply, "FORBIDDEN", "Citizens cannot access officer inspection queues");
    }
    const qs = request.query as Record<string, string | undefined>;
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
          "You are not allowed to access inspections in this authority"
        );
        if (!allowed) return;
        scopedAuthorityIds = [qs.authorityId];
      } else {
        scopedAuthorityIds = officerAuthorityIds;
        if (scopedAuthorityIds.length === 0) {
          return send403(reply, "FORBIDDEN", "You are not posted to any authority");
        }
      }
    }
    const includeCompleted = qs.includeCompleted === "true";
    const inspections = await getOfficerInspectionQueue(
      userId,
      includeCompleted,
      scopedAuthorityIds
    );
    return { inspections };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/inspections/for-application/*  (by ARN)
  // -----------------------------------------------------------------------
  app.get(
    "/api/v1/inspections/for-application/*",
    { schema: { params: arnWildcardParamsSchema } },
    async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) {
      return send400(reply, "ARN is required");
    }
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access inspections for this application"
    );
    if (!arn) return;
    const inspections = await getInspectionsForApplication(arn);
    return { inspections };
    }
  );

  // -----------------------------------------------------------------------
  // GET /api/v1/inspections/for-task/:taskId
  // -----------------------------------------------------------------------
  app.get("/api/v1/inspections/for-task/:taskId", { schema: { params: taskIdParamsSchema } }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const inspection = await getInspectionForTask(taskId);
    if (!inspection) {
      return { inspection: null, message: "No inspection linked to this task" };
    }
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      inspection.arn,
      "You are not allowed to access this inspection"
    );
    if (!arn) return;
    return { inspection };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/inspections/:inspectionId
  // -----------------------------------------------------------------------
  app.get("/api/v1/inspections/:inspectionId", { schema: { params: inspectionIdParamsSchema } }, async (request, reply) => {
    const { inspectionId } = request.params as { inspectionId: string };
    const inspection = await getInspectionById(inspectionId);
    if (!inspection) {
      return send404(reply, "Inspection not found");
    }
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      inspection.arn,
      "You are not allowed to access this inspection"
    );
    if (!arn) return;
    return { inspection };
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/inspections  — manually schedule an inspection
  // Body: { arn, taskId?, inspectionType, scheduledAt?, officerUserId?, officerRoleId? }
  // -----------------------------------------------------------------------
  app.post("/api/v1/inspections", { schema: createInspectionSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) {
      reply.code(401);
      return { error: "Authentication required" };
    }

    const body = request.body as Record<string, unknown>;
    const arn = body.arn as string | undefined;
    const inspectionType = body.inspectionType as string | undefined;

    if (!arn || !inspectionType) {
      return send400(reply, "arn and inspectionType are required");
    }

    const resolvedArn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      arn,
      "You are not allowed to create inspections for this application"
    );
    if (!resolvedArn) return;

    const inspection = await createInspection({
      arn: resolvedArn,
      taskId: body.taskId as string | undefined,
      inspectionType,
      scheduledAt: body.scheduledAt as string | undefined,
      officerUserId: body.officerUserId as string | undefined,
      officerRoleId: body.officerRoleId as string | undefined,
    });

    reply.code(201);
    return { inspection };
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/inspections/:inspectionId/assign
  // Body: { officerUserId, officerRoleId? }
  // -----------------------------------------------------------------------
  app.patch(
    "/api/v1/inspections/:inspectionId/assign",
    { schema: assignInspectionSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) {
      reply.code(401);
      return { error: "Authentication required" };
    }

    const { inspectionId } = request.params as { inspectionId: string };
    const body = request.body as Record<string, unknown>;
    const officerUserId = body.officerUserId as string | undefined;

    if (!officerUserId) {
      return send400(reply, "officerUserId is required");
    }
    const existing = await getInspectionById(inspectionId);
    if (!existing) {
      return send404(reply, "Inspection not found or already completed");
    }
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to assign this inspection"
    );
    if (!arn) return;

    const inspection = await assignInspection(
      inspectionId,
      officerUserId,
      body.officerRoleId as string | undefined
    );
    if (!inspection) {
      return send404(reply, "Inspection not found or already completed");
    }
    return { inspection };
    }
  );

  // -----------------------------------------------------------------------
  // PATCH /api/v1/inspections/:inspectionId/complete
  // Body: { outcome, actualAt?, findingsSummary?, checklistData?, observations?, photos?, outcomeRemarks? }
  // -----------------------------------------------------------------------
  app.patch(
    "/api/v1/inspections/:inspectionId/complete",
    { schema: completeInspectionSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) {
      reply.code(401);
      return { error: "Authentication required" };
    }

    const { inspectionId } = request.params as { inspectionId: string };
    const body = request.body as Record<string, unknown>;
    const outcome = body.outcome as InspectionOutcome | undefined;

    if (!outcome || !["PASS", "FAIL", "REINSPECTION_REQUIRED", "NA"].includes(outcome)) {
      return send400(reply, "outcome is required and must be PASS, FAIL, REINSPECTION_REQUIRED, or NA");
    }

    const input: CompleteInspectionInput = {
      outcome,
      actualAt: body.actualAt as string | undefined,
      findingsSummary: body.findingsSummary as string | undefined,
      checklistData: body.checklistData as Record<string, unknown> | undefined,
      observations: body.observations as Record<string, unknown> | undefined,
      photos: body.photos as unknown[] | undefined,
      outcomeRemarks: body.outcomeRemarks as string | undefined,
    };
    const existing = await getInspectionById(inspectionId);
    if (!existing) {
      return send404(reply, "Inspection not found or already completed/cancelled");
    }
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to complete this inspection"
    );
    if (!arn) return;

    const inspection = await completeInspection(inspectionId, input);
    if (!inspection) {
      return send404(reply, "Inspection not found or already completed/cancelled");
    }
    return { inspection };
    }
  );

  // -----------------------------------------------------------------------
  // PATCH /api/v1/inspections/:inspectionId/cancel
  // -----------------------------------------------------------------------
  app.patch(
    "/api/v1/inspections/:inspectionId/cancel",
    { schema: inspectionCancelSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) {
      reply.code(401);
      return { error: "Authentication required" };
    }

    const { inspectionId } = request.params as { inspectionId: string };
    const existing = await getInspectionById(inspectionId);
    if (!existing) {
      return send404(reply, "Inspection not found or already completed/cancelled");
    }
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to cancel this inspection"
    );
    if (!arn) return;
    const inspection = await cancelInspection(inspectionId);
    if (!inspection) {
      return send404(reply, "Inspection not found or already completed/cancelled");
    }
    return { inspection };
    }
  );
}
