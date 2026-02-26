/**
 * Fee & Payment API routes — barrel file.
 *
 * Keeps shared schemas and helper constants, then delegates route
 * registration to three sub-modules:
 *   - fee-demand.routes.ts   (fee assessment + demand management)
 *   - fee-payment.routes.ts  (payment recording + verification)
 *   - fee-refund.routes.ts   (refund request management)
 */
import { FastifyInstance } from "fastify";
import { registerFeeDemandRoutes } from "./fee-demand.routes";
import { registerFeePaymentRoutes } from "./fee-payment.routes";
import { registerFeeRefundRoutes } from "./fee-refund.routes";

// ---------------------------------------------------------------------------
// Shared schemas — exported for sub-modules
// ---------------------------------------------------------------------------

export const assessFeesSchema = {
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

export const createDemandSchema = {
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

export const recordPaymentSchema = {
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

export const verifyPaymentSchema = {
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

export const paymentCallbackSchema = {
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

export const createRefundSchema = {
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

export const arnWildcardParamsSchema = {
  type: "object",
  required: ["*"],
  additionalProperties: false,
  properties: {
    "*": { type: "string", minLength: 1 },
  },
};

export const demandIdParamsSchema = {
  type: "object",
  required: ["demandId"],
  additionalProperties: false,
  properties: {
    demandId: { type: "string", minLength: 1 },
  },
};

export const paymentIdParamsSchema = {
  type: "object",
  required: ["paymentId"],
  additionalProperties: false,
  properties: {
    paymentId: { type: "string", minLength: 1 },
  },
};

export const refundIdParamsSchema = {
  type: "object",
  required: ["refundId"],
  additionalProperties: false,
  properties: {
    refundId: { type: "string", minLength: 1 },
  },
};

export const stateChangeMutationSchema = {
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

export const demandStateChangeSchema = {
  params: demandIdParamsSchema,
  ...stateChangeMutationSchema,
};

export const refundStateChangeSchema = {
  params: refundIdParamsSchema,
  ...stateChangeMutationSchema,
};

// ---------------------------------------------------------------------------
// Barrel registration — preserves the existing public API
// ---------------------------------------------------------------------------

export async function registerFeeRoutes(app: FastifyInstance) {
  await registerFeeDemandRoutes(app);
  await registerFeePaymentRoutes(app);
  await registerFeeRefundRoutes(app);
}
