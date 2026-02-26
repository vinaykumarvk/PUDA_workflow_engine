/**
 * Fee Refund sub-module — refund request management routes.
 *
 * Endpoints:
 * - POST   /api/v1/refunds
 * - GET    /api/v1/refunds/for-application/*
 * - PATCH  /api/v1/refunds/:refundId/approve
 * - PATCH  /api/v1/refunds/:refundId/reject
 * - PATCH  /api/v1/refunds/:refundId/process
 */
import { FastifyInstance } from "fastify";
import {
  createRefundRequest,
  getRefundsForApplication,
  getRefundRequestById,
  approveRefundRequest,
  rejectRefundRequest,
  processRefundRequest,
} from "../fees";
import { getAuthUserId, send400, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireApplicationStaffMutationAccess,
} from "../route-access";
import {
  createRefundSchema,
  arnWildcardParamsSchema,
  refundStateChangeSchema,
} from "./fee.routes";

export async function registerFeeRefundRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // REFUND REQUESTS
  // -----------------------------------------------------------------------

  /** POST /api/v1/refunds — create a refund request */
  app.post("/api/v1/refunds", { schema: createRefundSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const body = request.body as Record<string, unknown>;
    const arn = body.arn as string | undefined;
    const paymentId = body.paymentId as string | undefined;
    const reason = body.reason as string | undefined;
    const amount = body.amount as number | undefined;

    if (!arn || !paymentId || !reason || amount == null) {
      return send400(reply, "arn, paymentId, reason, and amount are required");
    }

    const resolvedArn = await requireApplicationReadAccess(
      request,
      reply,
      arn,
      "You are not allowed to create refund requests for this application"
    );
    if (!resolvedArn) return;

    const refund = await createRefundRequest(resolvedArn, {
      paymentId,
      reason,
      amount,
      bankDetails: body.bankDetails as Record<string, unknown> | undefined,
      requestedBy: userId,
    });

    reply.code(201);
    return { refund };
  });

  /** GET /api/v1/refunds/for-application/* — list refunds for an application */
  app.get("/api/v1/refunds/for-application/*", { schema: { params: arnWildcardParamsSchema } }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access refunds for this application"
    );
    if (!arn) return;

    const refunds = await getRefundsForApplication(arn);
    return { refunds };
  });

  /** PATCH /api/v1/refunds/:refundId/approve */
  app.patch(
    "/api/v1/refunds/:refundId/approve",
    { schema: refundStateChangeSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const { refundId } = request.params as { refundId: string };
    const existing = await getRefundRequestById(refundId);
    if (!existing) return send404(reply, "Refund not found or not in REQUESTED status");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to approve this refund request"
    );
    if (!arn) return;
    const refund = await approveRefundRequest(refundId, userId);
    if (!refund) return send404(reply, "Refund not found or not in REQUESTED status");
    return { refund };
    }
  );

  /** PATCH /api/v1/refunds/:refundId/reject */
  app.patch(
    "/api/v1/refunds/:refundId/reject",
    { schema: refundStateChangeSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const { refundId } = request.params as { refundId: string };
    const existing = await getRefundRequestById(refundId);
    if (!existing) return send404(reply, "Refund not found or not in REQUESTED status");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to reject this refund request"
    );
    if (!arn) return;
    const refund = await rejectRefundRequest(refundId, userId);
    if (!refund) return send404(reply, "Refund not found or not in REQUESTED status");
    return { refund };
    }
  );

  /** PATCH /api/v1/refunds/:refundId/process */
  app.patch(
    "/api/v1/refunds/:refundId/process",
    { schema: refundStateChangeSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const { refundId } = request.params as { refundId: string };
    const existing = await getRefundRequestById(refundId);
    if (!existing) return send404(reply, "Refund not found or not in APPROVED status");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to process this refund request"
    );
    if (!arn) return;
    const refund = await processRefundRequest(refundId, userId);
    if (!refund) return send404(reply, "Refund not found or not in APPROVED status");
    return { refund };
    }
  );
}
