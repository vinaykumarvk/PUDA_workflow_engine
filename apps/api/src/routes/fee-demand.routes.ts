/**
 * Fee Demand sub-module — fee assessment and demand management routes.
 *
 * Endpoints:
 * - POST   /api/v1/fees/assess
 * - GET    /api/v1/fees/line-items/*
 * - POST   /api/v1/fees/demands
 * - GET    /api/v1/fees/demands/for-application/*
 * - GET    /api/v1/fees/demands/pending/*
 * - GET    /api/v1/fees/demands/:demandId
 * - PATCH  /api/v1/fees/demands/:demandId/waive
 * - PATCH  /api/v1/fees/demands/:demandId/cancel
 */
import { FastifyInstance } from "fastify";
import {
  assessFees,
  getFeeLineItems,
  createDemand,
  getDemandById,
  getDemandsForApplication,
  getPendingDemands,
  waiveDemand,
  cancelDemand,
} from "../fees";
import { calculateFees } from "../payments";
import { query as dbQuery } from "../db";
import { getAuthUserId, send400, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireApplicationStaffMutationAccess,
} from "../route-access";
import {
  assessFeesSchema,
  createDemandSchema,
  arnWildcardParamsSchema,
  demandIdParamsSchema,
  demandStateChangeSchema,
} from "./fee.routes";

export async function registerFeeDemandRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // FEE LINE ITEMS
  // -----------------------------------------------------------------------

  /** POST /api/v1/fees/assess — create fee line items for an application */
  app.post("/api/v1/fees/assess", { schema: assessFeesSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const body = request.body as Record<string, unknown>;
    const arn = body.arn as string | undefined;
    const items = body.items as Array<Record<string, unknown>> | undefined;

    if (!arn || !items || !Array.isArray(items) || items.length === 0) {
      return send400(reply, "arn and items[] are required");
    }

    const resolvedArn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      arn,
      "You are not allowed to assess fees for this application"
    );
    if (!resolvedArn) return;

    const appResult = await dbQuery(
      "SELECT service_key, authority_id FROM application WHERE arn = $1",
      [resolvedArn]
    );
    if (appResult.rows.length === 0) {
      return send404(reply, "APPLICATION_NOT_FOUND", "Application not found");
    }
    const serviceKey = appResult.rows[0].service_key as string;
    const authorityId = appResult.rows[0].authority_id as string;

    let expectedSchedule;
    try {
      expectedSchedule = await calculateFees(serviceKey, authorityId);
    } catch (error: any) {
      const code = typeof error?.message === "string" ? error.message : "FEE_SCHEDULE_NOT_CONFIGURED";
      const knownClientErrors = new Set([
        "SERVICE_VERSION_NOT_FOUND",
        "FEE_SCHEDULE_NOT_CONFIGURED",
      ]);
      if (knownClientErrors.has(code) || /^FEE_SCHEDULE_INVALID_LINE_/.test(code)) {
        return send400(reply, code);
      }
      throw error;
    }

    const submittedItems = items.map((i) => ({
      feeHeadCode: String(i.feeHeadCode || "").trim(),
      amount: Number(i.amount),
    }));
    const expectedByCode = new Map(
      expectedSchedule.map((line) => [line.fee_type, line])
    );
    const amountsMatch = submittedItems.every((item) => {
      const expected = expectedByCode.get(item.feeHeadCode);
      return Boolean(expected) && Number.isFinite(item.amount) && expected!.amount === item.amount;
    });
    if (!amountsMatch || submittedItems.length !== expectedSchedule.length) {
      return send400(
        reply,
        "FEE_ITEMS_MISMATCH_WITH_SCHEDULE",
        "Submitted fee items do not match configured fee schedule"
      );
    }

    const lineItems = await assessFees(
      resolvedArn,
      expectedSchedule.map((line) => ({
        feeHeadCode: line.fee_type,
        description: line.description,
        baseAmount: line.amount,
        calculationInputs: {},
        amount: line.amount,
        currency: "INR",
        waiverAdjustment: 0,
      })),
      userId
    );

    reply.code(201);
    return { lineItems };
  });

  /** GET /api/v1/fees/line-items/:arn — list all fee line items for an application */
  app.get("/api/v1/fees/line-items/*", { schema: { params: arnWildcardParamsSchema } }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access fee line items for this application"
    );
    if (!arn) return;

    const lineItems = await getFeeLineItems(arn);
    return { lineItems };
  });

  // -----------------------------------------------------------------------
  // DEMANDS
  // -----------------------------------------------------------------------

  /** POST /api/v1/fees/demands — create a demand from line items */
  app.post("/api/v1/fees/demands", { schema: createDemandSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const body = request.body as Record<string, unknown>;
    const arn = body.arn as string | undefined;
    const lineItemIds = body.lineItemIds as string[] | undefined;

    if (!arn || !lineItemIds || !Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return send400(reply, "arn and lineItemIds[] are required");
    }

    const resolvedArn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      arn,
      "You are not allowed to create demands for this application"
    );
    if (!resolvedArn) return;

    try {
      const demand = await createDemand(resolvedArn, lineItemIds, {
        dueDate: body.dueDate as string | undefined,
        createdBy: userId,
      });
      reply.code(201);
      return { demand };
    } catch (err: any) {
      return send400(reply, err.message);
    }
  });

  /** GET /api/v1/fees/demands/for-application/* — list demands for an application */
  app.get("/api/v1/fees/demands/for-application/*", { schema: { params: arnWildcardParamsSchema } }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access demands for this application"
    );
    if (!arn) return;

    const demands = await getDemandsForApplication(arn);
    return { demands };
  });

  /** GET /api/v1/fees/demands/pending/* — list pending demands for an application */
  app.get("/api/v1/fees/demands/pending/*", { schema: { params: arnWildcardParamsSchema } }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access pending demands for this application"
    );
    if (!arn) return;

    const demands = await getPendingDemands(arn);
    return { demands };
  });

  /** GET /api/v1/fees/demands/:demandId — get a demand with its line items */
  app.get("/api/v1/fees/demands/:demandId", { schema: { params: demandIdParamsSchema } }, async (request, reply) => {
    const { demandId } = request.params as { demandId: string };
    const demand = await getDemandById(demandId);
    if (!demand) return send404(reply, "Demand not found");
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      demand.arn,
      "You are not allowed to access this demand"
    );
    if (!arn) return;
    return { demand };
  });

  /** PATCH /api/v1/fees/demands/:demandId/waive — waive a pending demand */
  app.patch(
    "/api/v1/fees/demands/:demandId/waive",
    { schema: demandStateChangeSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const { demandId } = request.params as { demandId: string };
    const existing = await getDemandById(demandId);
    if (!existing) return send404(reply, "Demand not found or not in PENDING status");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to waive this demand"
    );
    if (!arn) return;
    const demand = await waiveDemand(demandId);
    if (!demand) return send404(reply, "Demand not found or not in PENDING status");
    return { demand };
    }
  );

  /** PATCH /api/v1/fees/demands/:demandId/cancel — cancel a pending demand */
  app.patch(
    "/api/v1/fees/demands/:demandId/cancel",
    { schema: demandStateChangeSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const { demandId } = request.params as { demandId: string };
    const existing = await getDemandById(demandId);
    if (!existing) return send404(reply, "Demand not found or not in PENDING status");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to cancel this demand"
    );
    if (!arn) return;
    const demand = await cancelDemand(demandId);
    if (!demand) return send404(reply, "Demand not found or not in PENDING status");
    return { demand };
    }
  );
}
