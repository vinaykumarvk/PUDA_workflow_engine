/**
 * Fee & Payment API routes.
 *
 * Provides endpoints for:
 * - Assessing (creating) fee line items for an application
 * - Creating a demand from line items
 * - Recording a payment against a demand
 * - Querying fees, demands, and payments for an application
 * - Refund request management
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
  createRefundRequest,
  getRefundsForApplication,
  getRefundRequestById,
  approveRefundRequest,
  rejectRefundRequest,
  processRefundRequest,
} from "../fees";
import {
  calculateFees,
  recordPayment,
  processGatewayCallback,
  getPaymentById,
  getPaymentsForApplication,
  getPaymentsForDemand,
  verifyGatewayPayment,
} from "../payments";
import { query as dbQuery } from "../db";
import { getAuthUserId, send400, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireApplicationStaffMutationAccess,
} from "../route-access";

const assessFeesSchema = {
  body: {
    type: "object",
    required: ["arn", "items"],
    additionalProperties: false,
    properties: {
      arn: { type: "string", minLength: 1 },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["feeHeadCode", "amount"],
          additionalProperties: false,
          properties: {
            feeHeadCode: { type: "string", minLength: 1 },
            description: { type: "string" },
            baseAmount: { type: "number" },
            calculationInputs: { type: "object" },
            amount: { type: "number" },
            currency: { type: "string" },
            waiverAdjustment: { type: "number" },
          },
        },
      },
    },
  },
};

const createDemandSchema = {
  body: {
    type: "object",
    required: ["arn", "lineItemIds"],
    additionalProperties: false,
    properties: {
      arn: { type: "string", minLength: 1 },
      lineItemIds: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 },
      },
      dueDate: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
  },
};

const recordPaymentSchema = {
  body: {
    type: "object",
    required: ["arn", "mode", "amount"],
    additionalProperties: false,
    properties: {
      arn: { type: "string", minLength: 1 },
      demandId: { type: "string" },
      mode: {
        type: "string",
        enum: ["GATEWAY", "UPI", "CARD", "NETBANKING", "CHALLAN", "NEFT", "COUNTER"],
      },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string" },
      receiptNumber: { type: "string" },
      receiptDate: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      gatewayOrderId: { type: "string" },
      instrumentNumber: { type: "string" },
      instrumentBank: { type: "string" },
      instrumentDate: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
  },
};

const verifyPaymentSchema = {
  params: {
    type: "object",
    required: ["paymentId"],
    additionalProperties: false,
    properties: {
      paymentId: { type: "string", minLength: 1 },
    },
  },
  body: {
    type: "object",
    required: ["gatewayPaymentId", "gatewaySignature"],
    additionalProperties: false,
    properties: {
      gatewayPaymentId: { type: "string", minLength: 1 },
      gatewaySignature: { type: "string", minLength: 1 },
    },
  },
};

const paymentCallbackSchema = {
  body: {
    type: "object",
    required: ["gatewayOrderId", "gatewayPaymentId", "gatewaySignature", "status"],
    additionalProperties: false,
    properties: {
      gatewayOrderId: { type: "string", minLength: 1 },
      gatewayPaymentId: { type: "string", minLength: 1 },
      gatewaySignature: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["SUCCESS", "FAILED"] },
      failureReason: { type: "string", minLength: 1 },
      providerName: { type: "string", minLength: 1 },
    },
  },
};

const createRefundSchema = {
  body: {
    type: "object",
    required: ["arn", "paymentId", "reason", "amount"],
    additionalProperties: false,
    properties: {
      arn: { type: "string", minLength: 1 },
      paymentId: { type: "string", minLength: 1 },
      reason: { type: "string", minLength: 1 },
      amount: { type: "number" },
      bankDetails: { type: "object" },
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

const demandIdParamsSchema = {
  type: "object",
  required: ["demandId"],
  additionalProperties: false,
  properties: {
    demandId: { type: "string", minLength: 1 },
  },
};

const paymentIdParamsSchema = {
  type: "object",
  required: ["paymentId"],
  additionalProperties: false,
  properties: {
    paymentId: { type: "string", minLength: 1 },
  },
};

const refundIdParamsSchema = {
  type: "object",
  required: ["refundId"],
  additionalProperties: false,
  properties: {
    refundId: { type: "string", minLength: 1 },
  },
};

const stateChangeMutationSchema = {
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

const demandStateChangeSchema = {
  params: demandIdParamsSchema,
  ...stateChangeMutationSchema,
};

const refundStateChangeSchema = {
  params: refundIdParamsSchema,
  ...stateChangeMutationSchema,
};

export async function registerFeeRoutes(app: FastifyInstance) {
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
