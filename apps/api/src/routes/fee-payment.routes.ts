/**
 * Fee Payment sub-module — payment recording and verification routes.
 *
 * Endpoints:
 * - POST   /api/v1/payments
 * - GET    /api/v1/payments/for-application/*
 * - GET    /api/v1/payments/for-demand/:demandId
 * - GET    /api/v1/payments/:paymentId
 * - POST   /api/v1/payments/:paymentId/verify
 * - POST   /api/v1/payments/callback
 */
import { FastifyInstance } from "fastify";
import { getDemandById } from "../fees";
import {
  recordPayment,
  processGatewayCallback,
  getPaymentById,
  getPaymentsForApplication,
  getPaymentsForDemand,
  verifyGatewayPayment,
} from "../payments";
import { getAuthUserId, send400, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireApplicationStaffMutationAccess,
} from "../route-access";
import {
  recordPaymentSchema,
  verifyPaymentSchema,
  paymentCallbackSchema,
  arnWildcardParamsSchema,
  demandIdParamsSchema,
  paymentIdParamsSchema,
} from "./fee.routes";

export async function registerFeePaymentRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // PAYMENTS
  // -----------------------------------------------------------------------

  /** POST /api/v1/payments — record a payment against a demand */
  app.post("/api/v1/payments", { schema: recordPaymentSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) { reply.code(401); return { error: "Authentication required" }; }

    const body = request.body as Record<string, unknown>;
    const arn = body.arn as string | undefined;
    const mode = body.mode as string | undefined;
    const amount = body.amount as number | undefined;

    if (!arn || !mode || amount == null) {
      return send400(reply, "arn, mode, and amount are required");
    }

    const resolvedArn = await requireApplicationReadAccess(
      request,
      reply,
      arn,
      "You are not allowed to create payments for this application"
    );
    if (!resolvedArn) return;

    let payment: Awaited<ReturnType<typeof recordPayment>>;
    try {
      payment = await recordPayment({
        arn: resolvedArn,
        demandId: body.demandId as string | undefined,
        mode: mode as any,
        amount,
        currency: body.currency as string | undefined,
        receiptNumber: body.receiptNumber as string | undefined,
        receiptDate: body.receiptDate as string | undefined,
        gatewayOrderId: body.gatewayOrderId as string | undefined,
        instrumentNumber: body.instrumentNumber as string | undefined,
        instrumentBank: body.instrumentBank as string | undefined,
        instrumentDate: body.instrumentDate as string | undefined,
      });
    } catch (err: any) {
      const code = err?.message;
      const knownClientErrors = new Set([
        "PAYMENT_AMOUNT_INVALID",
        "DEMAND_NOT_FOUND",
        "DEMAND_NOT_PAYABLE",
        "DEMAND_ALREADY_PAID",
        "DEMAND_ARN_MISMATCH",
        "PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE",
      ]);
      if (knownClientErrors.has(code)) {
        return send400(reply, code);
      }
      throw err;
    }

    reply.code(201);
    return { payment };
  });

  /** GET /api/v1/payments/for-application/* — list payments for an application */
  app.get("/api/v1/payments/for-application/*", { schema: { params: arnWildcardParamsSchema } }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access payments for this application"
    );
    if (!arn) return;

    const payments = await getPaymentsForApplication(arn);
    return { payments };
  });

  /** GET /api/v1/payments/for-demand/:demandId — list payments for a demand */
  app.get("/api/v1/payments/for-demand/:demandId", { schema: { params: demandIdParamsSchema } }, async (request, reply) => {
    const { demandId } = request.params as { demandId: string };
    const demand = await getDemandById(demandId);
    if (!demand) return send404(reply, "Demand not found");
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      demand.arn,
      "You are not allowed to access payments for this demand"
    );
    if (!arn) return;
    const payments = await getPaymentsForDemand(demandId);
    return { payments };
  });

  /** GET /api/v1/payments/:paymentId — get payment details */
  app.get("/api/v1/payments/:paymentId", { schema: { params: paymentIdParamsSchema } }, async (request, reply) => {
    const { paymentId } = request.params as { paymentId: string };
    const payment = await getPaymentById(paymentId);
    if (!payment) return send404(reply, "Payment not found");
    const arn = await requireApplicationReadAccess(
      request,
      reply,
      payment.arn,
      "You are not allowed to access this payment"
    );
    if (!arn) return;
    return { payment };
  });

  /** POST /api/v1/payments/:paymentId/verify — verify a gateway payment callback */
  app.post(
    "/api/v1/payments/:paymentId/verify",
    { schema: verifyPaymentSchema },
    async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    const { paymentId } = request.params as { paymentId: string };
    const body = request.body as Record<string, unknown>;
    const existing = await getPaymentById(paymentId);
    if (!existing) return send404(reply, "Payment not found or not in INITIATED status");
    const arn = await requireApplicationStaffMutationAccess(
      request,
      reply,
      existing.arn,
      "You are not allowed to verify this payment"
    );
    if (!arn) return;

    try {
      const payment = await verifyGatewayPayment(
        paymentId,
        body.gatewayPaymentId as string,
        body.gatewaySignature as string,
        userId || undefined
      );
      if (!payment) return send404(reply, "Payment not found or not in INITIATED status");
      return { payment };
    } catch (err: any) {
      const code = err?.message;
      const knownClientErrors = new Set([
        "PAYMENT_CALLBACK_FIELDS_REQUIRED",
        "PAYMENT_AMOUNT_INVALID",
        "PAYMENT_REPLAY_DETECTED",
        "PAYMENT_ORDER_ID_MISSING",
        "INVALID_GATEWAY_SIGNATURE",
        "PAYMENT_SIGNATURE_SECRET_NOT_CONFIGURED",
        "PAYMENT_ALREADY_VERIFIED",
        "DEMAND_NOT_FOUND",
        "DEMAND_NOT_PAYABLE",
        "DEMAND_ALREADY_PAID",
        "DEMAND_ARN_MISMATCH",
        "PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE",
      ]);
      if (knownClientErrors.has(code)) {
        return send400(reply, code);
      }
      throw err;
    }
    }
  );

  /** POST /api/v1/payments/callback — public gateway callback endpoint (signature-verified) */
  app.post(
    "/api/v1/payments/callback",
    { schema: paymentCallbackSchema },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      try {
        const payment = await processGatewayCallback({
          gatewayOrderId: String(body.gatewayOrderId),
          gatewayPaymentId: String(body.gatewayPaymentId),
          gatewaySignature: String(body.gatewaySignature),
          status: body.status as "SUCCESS" | "FAILED",
          failureReason: body.failureReason ? String(body.failureReason) : undefined,
          providerName: body.providerName ? String(body.providerName) : undefined,
        });
        if (!payment) return send404(reply, "PAYMENT_NOT_FOUND");
        return { accepted: true, payment };
      } catch (err: any) {
        const code = err?.message;
        const knownClientErrors = new Set([
          "PAYMENT_CALLBACK_FIELDS_REQUIRED",
          "INVALID_PAYMENT_STATUS",
          "PAYMENT_AMOUNT_INVALID",
          "PAYMENT_REPLAY_DETECTED",
          "PAYMENT_ORDER_ID_MISSING",
          "INVALID_GATEWAY_SIGNATURE",
          "PAYMENT_SIGNATURE_SECRET_NOT_CONFIGURED",
          "PAYMENT_ALREADY_VERIFIED",
          "DEMAND_NOT_FOUND",
          "DEMAND_NOT_PAYABLE",
          "DEMAND_ALREADY_PAID",
          "DEMAND_ARN_MISMATCH",
          "PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE",
        ]);
        if (knownClientErrors.has(code)) {
          return send400(reply, code);
        }
        throw err;
      }
    }
  );
}
