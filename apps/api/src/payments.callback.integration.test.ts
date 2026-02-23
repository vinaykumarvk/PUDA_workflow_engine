import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { createApplication } from "./applications";
import { assessFees, createDemand, getDemandById } from "./fees";
import { query } from "./db";
import { getPaymentById, recordPayment } from "./payments";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const TEST_AUTHORITY_ID = "PUDA";
const TEST_SERVICE_KEY = "no_due_certificate";
const TEST_CITIZEN_ID = "test-citizen-1";
const TEST_OFFICER_ID = "test-officer-1";

function hmacSignature(secret: string, gatewayOrderId: string, gatewayPaymentId: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest("hex");
}

async function cleanupApplicationTree(arn: string): Promise<void> {
  await query(
    `DELETE FROM notice_letter
      WHERE arn = $1
         OR query_id IN (SELECT query_id FROM query WHERE arn = $1)
         OR decision_id IN (SELECT decision_id FROM decision WHERE arn = $1)`,
    [arn]
  );
  await query(`DELETE FROM output WHERE arn = $1`, [arn]);
  await query(`DELETE FROM decision WHERE arn = $1`, [arn]);
  await query(`DELETE FROM inspection WHERE arn = $1`, [arn]);
  await query(`DELETE FROM refund_request WHERE arn = $1`, [arn]);
  await query(`DELETE FROM payment WHERE arn = $1`, [arn]);
  await query(
    `DELETE FROM fee_demand_line
      WHERE demand_id IN (SELECT demand_id FROM fee_demand WHERE arn = $1)`,
    [arn]
  );
  await query(`DELETE FROM fee_demand WHERE arn = $1`, [arn]);
  await query(`DELETE FROM fee_line_item WHERE arn = $1`, [arn]);
  await query(`DELETE FROM notification_log WHERE arn = $1`, [arn]);
  await query(`DELETE FROM notification WHERE arn = $1`, [arn]);
  await query(`DELETE FROM document WHERE arn = $1`, [arn]);
  await query(`DELETE FROM query WHERE arn = $1`, [arn]);
  await query(`DELETE FROM task WHERE arn = $1`, [arn]);
  await query(`DELETE FROM application_property WHERE arn = $1`, [arn]);
  await query(`DELETE FROM application WHERE arn = $1`, [arn]);
}

async function createDemandFixture(totalAmount = 500): Promise<{ arn: string; demandId: string }> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const app = await createApplication(
    TEST_AUTHORITY_ID,
    TEST_SERVICE_KEY,
    TEST_CITIZEN_ID,
    {
      applicant: { full_name: "Payment Callback Test Citizen" },
      property: { upn: `PAY-CB-UPN-${uniqueSuffix}` },
    }
  );
  const lineItems = await assessFees(
    app.arn,
    [
      {
        feeHeadCode: "PROCESSING_FEE",
        description: "Processing fee",
        amount: totalAmount,
      },
    ],
    TEST_OFFICER_ID
  );
  const demand = await createDemand(app.arn, [lineItems[0].line_item_id], {
    createdBy: TEST_OFFICER_ID,
  });
  return { arn: app.arn, demandId: demand.demand_id };
}

describe("Payments Callback Integration", () => {
  let dbReady = false;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const createdArns = new Set<string>();
  const originalGatewaySecret = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
  const originalSignatureRequired = process.env.PAYMENT_SIGNATURE_REQUIRED;
  const originalGatewayProvider = process.env.PAYMENT_GATEWAY_PROVIDER;
  const originalRateLimitMax = process.env.RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = "10000";
    app = await buildApp(false);
    try {
      await query("SELECT 1");
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  afterEach(async () => {
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = originalGatewaySecret;
    process.env.PAYMENT_SIGNATURE_REQUIRED = originalSignatureRequired;
    process.env.PAYMENT_GATEWAY_PROVIDER = originalGatewayProvider;
    for (const arn of createdArns) {
      await cleanupApplicationTree(arn);
    }
    createdArns.clear();
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_MAX = originalRateLimitMax;
    await app.close();
  });

  it("accepts signature-verified SUCCESS callbacks without bearer auth", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-callback-secret";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(450);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 450,
      gatewayOrderId: "order_callback_success_1",
    });

    const gatewayPaymentId = "gp_callback_success_1";
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/callback",
      payload: {
        gatewayOrderId: payment.gateway_order_id,
        gatewayPaymentId,
        gatewaySignature: hmacSignature(
          "test-callback-secret",
          payment.gateway_order_id as string,
          gatewayPaymentId
        ),
        status: "SUCCESS",
        providerName: "PHASE2_STUB_PROVIDER",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.accepted).toBe(true);
    expect(body.payment.status).toBe("VERIFIED");
    expect(body.payment.gateway_payment_id).toBe(gatewayPaymentId);
    expect(body.payment.provider_name).toBe("PHASE2_STUB_PROVIDER");

    const demand = await getDemandById(demandId);
    expect(demand?.status).toBe("PAID");
    expect(demand?.paid_amount).toBe(450);
  });

  it("returns 404 when callback references an unknown gateway order", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/callback",
      payload: {
        gatewayOrderId: "order_does_not_exist",
        gatewayPaymentId: "gp_unknown_order",
        gatewaySignature: "deadbeef",
        status: "SUCCESS",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).error).toBe("PAYMENT_NOT_FOUND");
  });

  it("treats callback as public route and returns 400 schema error (not 401) for malformed payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/callback",
      payload: {
        gatewayOrderId: "missing-fields",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("INVALID_REQUEST_BODY");
  });

  it("rejects callback with invalid signature", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-callback-secret-invalid";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(290);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 290,
      gatewayOrderId: "order_callback_invalid_1",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/callback",
      payload: {
        gatewayOrderId: payment.gateway_order_id,
        gatewayPaymentId: "gp_callback_invalid_1",
        gatewaySignature: "not-valid-signature",
        status: "SUCCESS",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("INVALID_GATEWAY_SIGNATURE");

    const unchanged = await getPaymentById(payment.payment_id);
    expect(unchanged?.status).toBe("INITIATED");
  });

  it("marks payment failed on signature-verified FAILED callbacks", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-callback-secret-fail";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(360);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 360,
      gatewayOrderId: "order_callback_failed_1",
    });

    const gatewayPaymentId = "gp_callback_failed_1";
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/callback",
      payload: {
        gatewayOrderId: payment.gateway_order_id,
        gatewayPaymentId,
        gatewaySignature: hmacSignature(
          "test-callback-secret-fail",
          payment.gateway_order_id as string,
          gatewayPaymentId
        ),
        status: "FAILED",
        failureReason: "BANK_DECLINED",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.accepted).toBe(true);
    expect(body.payment.status).toBe("FAILED");
    expect(body.payment.failure_reason).toBe("BANK_DECLINED");

    const demand = await getDemandById(demandId);
    expect(demand?.status).toBe("PENDING");
    expect(demand?.paid_amount).toBe(0);
  });
});
