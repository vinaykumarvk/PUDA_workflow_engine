import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApplication } from "./applications";
import {
  approveRefundRequest,
  assessFees,
  createDemand,
  createRefundRequest,
  getDemandById,
  getRefundRequestById,
  processRefundRequest,
  rejectRefundRequest,
} from "./fees";
import { query } from "./db";
import {
  calculateFees,
  failPayment,
  getPaymentByGatewayOrderId,
  getPaymentById,
  getPaymentsForApplication,
  getPaymentsForDemand,
  processGatewayCallback,
  recordPayment,
  verifyGatewayPayment,
} from "./payments";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const TEST_AUTHORITY_ID = "PUDA";
const TEST_SERVICE_KEY = "no_due_certificate";
const TEST_CITIZEN_ID = "test-citizen-1";

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
  await query(`DELETE FROM application_document WHERE arn = $1`, [arn]);
  await query(`DELETE FROM document WHERE arn = $1`, [arn]);
  await query(`DELETE FROM query WHERE arn = $1`, [arn]);
  await query(`DELETE FROM task WHERE arn = $1`, [arn]);
  await query(`DELETE FROM application_property WHERE arn = $1`, [arn]);
  await query(`DELETE FROM application WHERE arn = $1`, [arn]);
}

async function seedServiceVersionWithFeeSchedule(
  serviceKey: string,
  feeSchedule: unknown
): Promise<void> {
  await query(
    `INSERT INTO service (service_key, name, category, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (service_key)
     DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, description = EXCLUDED.description`,
    [serviceKey, `Test Service ${serviceKey}`, "TEST", "Fee schedule coverage fixture"]
  );
  await query(
    `INSERT INTO service_version (service_key, version, status, effective_from, config_jsonb)
     VALUES ($1, '1.0.0', 'published', NOW(), $2::jsonb)
     ON CONFLICT (service_key, version)
     DO UPDATE SET status = EXCLUDED.status, effective_from = EXCLUDED.effective_from, config_jsonb = EXCLUDED.config_jsonb`,
    [serviceKey, JSON.stringify({ feeSchedule })]
  );
}

async function createDemandFixture(totalAmount = 500): Promise<{ arn: string; demandId: string }> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const app = await createApplication(
    TEST_AUTHORITY_ID,
    TEST_SERVICE_KEY,
    TEST_CITIZEN_ID,
    {
      applicant: { full_name: "Payment Test Citizen" },
      property: { upn: `PAY-UPN-${uniqueSuffix}` },
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
    "test-officer-1"
  );
  const demand = await createDemand(app.arn, [lineItems[0].line_item_id], {
    createdBy: "test-officer-1",
  });
  return { arn: app.arn, demandId: demand.demand_id };
}

describe("Payments Lifecycle Integration", () => {
  let dbReady = false;
  const createdArns = new Set<string>();
  const createdServiceKeys = new Set<string>();
  const originalGatewaySecret = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
  const originalSignatureRequired = process.env.PAYMENT_SIGNATURE_REQUIRED;
  const originalGatewayProvider = process.env.PAYMENT_GATEWAY_PROVIDER;

  beforeAll(async () => {
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
    for (const serviceKey of createdServiceKeys) {
      await query("DELETE FROM service_version WHERE service_key = $1", [serviceKey]);
      await query("DELETE FROM service WHERE service_key = $1", [serviceKey]);
    }
    createdArns.clear();
    createdServiceKeys.clear();
  });

  it("marks demand as paid for immediate COUNTER payments", async () => {
    const { arn, demandId } = await createDemandFixture(550);
    createdArns.add(arn);

    const payment = await recordPayment({
      arn,
      demandId,
      mode: "COUNTER",
      amount: 550,
      receiptNumber: "RCT-001",
    });
    expect(payment.status).toBe("SUCCESS");
    expect(payment.demand_id).toBe(demandId);

    const demand = await getDemandById(demandId);
    expect(demand).toBeTruthy();
    expect(demand?.status).toBe("PAID");
    expect(demand?.paid_amount).toBe(550);
  });

  it("rejects zero and negative payment amounts", async () => {
    const { arn, demandId } = await createDemandFixture(250);
    createdArns.add(arn);

    await expect(
      recordPayment({
        arn,
        demandId,
        mode: "COUNTER",
        amount: 0,
      })
    ).rejects.toThrow("PAYMENT_AMOUNT_INVALID");

    await expect(
      recordPayment({
        arn,
        demandId,
        mode: "COUNTER",
        amount: -10,
      })
    ).rejects.toThrow("PAYMENT_AMOUNT_INVALID");
  });

  it("rejects payments that exceed remaining demand balance", async () => {
    const { arn, demandId } = await createDemandFixture(500);
    createdArns.add(arn);

    const firstPayment = await recordPayment({
      arn,
      demandId,
      mode: "COUNTER",
      amount: 200,
      receiptNumber: "RCT-OVERPAY-1",
    });
    expect(firstPayment.status).toBe("SUCCESS");

    await expect(
      recordPayment({
        arn,
        demandId,
        mode: "COUNTER",
        amount: 400,
        receiptNumber: "RCT-OVERPAY-2",
      })
    ).rejects.toThrow("PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE");

    const demand = await getDemandById(demandId);
    expect(demand?.status).toBe("PARTIALLY_PAID");
    expect(demand?.paid_amount).toBe(200);
  });

  it("keeps gateway payments INITIATED before callback verification", async () => {
    const { arn, demandId } = await createDemandFixture(300);
    createdArns.add(arn);

    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 300,
      gatewayOrderId: "order_init_1",
    });
    expect(payment.status).toBe("INITIATED");

    const demand = await getDemandById(demandId);
    expect(demand?.status).toBe("PENDING");
    expect(demand?.paid_amount).toBe(0);
  });

  it("auto-creates gateway order metadata through the runtime gateway adapter", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    const { arn, demandId } = await createDemandFixture(325);
    createdArns.add(arn);

    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 325,
    });

    expect(payment.status).toBe("INITIATED");
    expect(payment.gateway_order_id).toMatch(/^stub_order_/);
    expect(payment.provider_name).toBe("STUB_GATEWAY");
    expect(payment.provider_transaction_id).toMatch(/^stub_txn_/);
  });

  it("verifies gateway payment with stubbed signature and updates demand", async () => {
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-secret-verified";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(400);
    createdArns.add(arn);

    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 400,
      gatewayOrderId: "order_verify_1",
    });
    const gatewayPaymentId = "gp_verified_1";
    const signature = hmacSignature(
      "test-secret-verified",
      payment.gateway_order_id as string,
      gatewayPaymentId
    );
    const verified = await verifyGatewayPayment(
      payment.payment_id,
      gatewayPaymentId,
      signature,
      "test-officer-3"
    );
    expect(verified).toBeTruthy();
    expect(verified?.status).toBe("VERIFIED");
    expect(verified?.gateway_payment_id).toBe(gatewayPaymentId);
    expect(verified?.verified_by_user_id).toBe("test-officer-3");

    const demand = await getDemandById(demandId);
    expect(demand?.status).toBe("PAID");
    expect(demand?.paid_amount).toBe(400);
  });

  it("prevents concurrent gateway verification from over-crediting a demand", async () => {
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-secret-concurrent-verify";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(450);
    createdArns.add(arn);

    const paymentA = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 300,
      gatewayOrderId: "order_concurrent_verify_a",
    });
    const paymentB = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 300,
      gatewayOrderId: "order_concurrent_verify_b",
    });

    const paymentARef = "gp_concurrent_verify_a";
    const paymentBRef = "gp_concurrent_verify_b";
    const signatureA = hmacSignature(
      "test-secret-concurrent-verify",
      paymentA.gateway_order_id as string,
      paymentARef
    );
    const signatureB = hmacSignature(
      "test-secret-concurrent-verify",
      paymentB.gateway_order_id as string,
      paymentBRef
    );

    const [resultA, resultB] = await Promise.allSettled([
      verifyGatewayPayment(paymentA.payment_id, paymentARef, signatureA, "test-officer-3"),
      verifyGatewayPayment(paymentB.payment_id, paymentBRef, signatureB, "test-officer-3"),
    ]);

    const fulfilled = [resultA, resultB].filter((result) => result.status === "fulfilled");
    const rejected = [resultA, resultB].filter((result) => result.status === "rejected") as Array<PromiseRejectedResult>;
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason?.message || rejected[0].reason)).toBe(
      "PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE"
    );

    const demand = await getDemandById(demandId);
    expect(demand?.status).toBe("PARTIALLY_PAID");
    expect(demand?.paid_amount).toBe(300);
  });

  it("treats repeat verify callback with same gatewayPaymentId as idempotent", async () => {
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-secret-idempotent";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(275);
    createdArns.add(arn);

    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 275,
      gatewayOrderId: "order_idempotent_1",
    });
    const gatewayPaymentId = "gp_idempotent_1";
    const signature = hmacSignature(
      "test-secret-idempotent",
      payment.gateway_order_id as string,
      gatewayPaymentId
    );
    const first = await verifyGatewayPayment(payment.payment_id, gatewayPaymentId, signature, "test-officer-3");
    expect(first?.status).toBe("VERIFIED");

    const second = await verifyGatewayPayment(payment.payment_id, gatewayPaymentId, signature, "test-officer-3");
    expect(second?.status).toBe("VERIFIED");
    expect(second?.payment_id).toBe(payment.payment_id);

    const demand = await getDemandById(demandId);
    expect(demand?.paid_amount).toBe(275);
  });

  it("rejects replayed gateway payment references across payments", async () => {
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-secret-replay";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const firstFixture = await createDemandFixture(200);
    const secondFixture = await createDemandFixture(210);
    createdArns.add(firstFixture.arn);
    createdArns.add(secondFixture.arn);

    const firstPayment = await recordPayment({
      arn: firstFixture.arn,
      demandId: firstFixture.demandId,
      mode: "GATEWAY",
      amount: 200,
      gatewayOrderId: "order_replay_1",
    });
    const secondPayment = await recordPayment({
      arn: secondFixture.arn,
      demandId: secondFixture.demandId,
      mode: "GATEWAY",
      amount: 210,
      gatewayOrderId: "order_replay_2",
    });

    const replayedGatewayPaymentId = "gp_replay_same_ref";
    const firstSignature = hmacSignature(
      "test-secret-replay",
      firstPayment.gateway_order_id as string,
      replayedGatewayPaymentId
    );
    await verifyGatewayPayment(
      firstPayment.payment_id,
      replayedGatewayPaymentId,
      firstSignature,
      "test-officer-3"
    );

    await expect(
      verifyGatewayPayment(
        secondPayment.payment_id,
        replayedGatewayPaymentId,
        "deadbeef",
        "test-officer-3"
      )
    ).rejects.toThrow("PAYMENT_REPLAY_DETECTED");
  });

  it("rejects invalid gateway signature when secret is configured", async () => {
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "test-secret-invalid-signature";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(330);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 330,
      gatewayOrderId: "order_invalid_sig",
    });

    await expect(
      verifyGatewayPayment(payment.payment_id, "gp_invalid_sig", "not-valid-signature", "test-officer-3")
    ).rejects.toThrow("INVALID_GATEWAY_SIGNATURE");

    const stillInitiated = await getPaymentById(payment.payment_id);
    expect(stillInitiated?.status).toBe("INITIATED");
  });

  it("fails verification when signature enforcement is on but webhook secret is missing", async () => {
    delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";

    const { arn, demandId } = await createDemandFixture(380);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 380,
      gatewayOrderId: "order_secret_missing",
    });

    await expect(
      verifyGatewayPayment(payment.payment_id, "gp_secret_missing", "abcdef", "test-officer-3")
    ).rejects.toThrow("PAYMENT_SIGNATURE_SECRET_NOT_CONFIGURED");
  });

  it("can list and resolve payments by application, demand, and gateway order id", async () => {
    const { arn, demandId } = await createDemandFixture(520);
    createdArns.add(arn);

    const counter = await recordPayment({
      arn,
      demandId,
      mode: "COUNTER",
      amount: 260,
      receiptNumber: "RCT-LIST-001",
    });
    const gateway = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 260,
      gatewayOrderId: "order_lookup_1",
    });

    const byApplication = await getPaymentsForApplication(arn);
    expect(byApplication.some((payment) => payment.payment_id === counter.payment_id)).toBe(true);
    expect(byApplication.some((payment) => payment.payment_id === gateway.payment_id)).toBe(true);

    const byDemand = await getPaymentsForDemand(demandId);
    expect(byDemand.some((payment) => payment.payment_id === counter.payment_id)).toBe(true);
    expect(byDemand.some((payment) => payment.payment_id === gateway.payment_id)).toBe(true);

    const byGatewayOrder = await getPaymentByGatewayOrderId("order_lookup_1");
    expect(byGatewayOrder?.payment_id).toBe(gateway.payment_id);
  });

  it("marks initiated gateway payments as FAILED with reason", async () => {
    const { arn, demandId } = await createDemandFixture(420);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "GATEWAY",
      amount: 420,
      gatewayOrderId: "order_fail_helper_1",
    });
    expect(payment.status).toBe("INITIATED");

    const failed = await failPayment(payment.payment_id, "BANK_TIMEOUT");
    expect(failed?.status).toBe("FAILED");
    expect(failed?.failure_reason).toBe("BANK_TIMEOUT");
  });

  it("rejects malformed callback payloads and returns null for unknown order ids", async () => {
    await expect(
      processGatewayCallback({
        gatewayOrderId: "",
        gatewayPaymentId: "gp_invalid_payload",
        gatewaySignature: "deadbeef",
        status: "SUCCESS",
      } as any)
    ).rejects.toThrow("PAYMENT_CALLBACK_FIELDS_REQUIRED");

    await expect(
      processGatewayCallback({
        gatewayOrderId: "order_invalid_status",
        gatewayPaymentId: "gp_invalid_status",
        gatewaySignature: "deadbeef",
        status: "PENDING" as any,
      })
    ).rejects.toThrow("INVALID_PAYMENT_STATUS");

    const unknownOrder = await processGatewayCallback({
      gatewayOrderId: "order_unknown_direct_call",
      gatewayPaymentId: "gp_unknown_direct_call",
      gatewaySignature: "deadbeef",
      status: "SUCCESS",
    });
    expect(unknownOrder).toBeNull();
  });

  it("resolves fee schedules by authority and falls back to default schedule", async () => {
    const serviceKey = `fee_calc_ok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    createdServiceKeys.add(serviceKey);
    await seedServiceVersionWithFeeSchedule(serviceKey, {
      default: [{ feeType: "BASE_FEE", amount: 100, description: "Base fee" }],
      byAuthority: {
        PUDA: [{ feeType: "LOCAL_FEE", amount: 175 }],
      },
    });

    const authoritySpecific = await calculateFees(serviceKey, "PUDA");
    expect(authoritySpecific).toHaveLength(1);
    expect(authoritySpecific[0]).toEqual(
      expect.objectContaining({
        service_key: serviceKey,
        authority_id: "PUDA",
        fee_type: "LOCAL_FEE",
        amount: 175,
        description: "LOCAL_FEE",
      })
    );

    const fallback = await calculateFees(serviceKey, "GMADA");
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toEqual(
      expect.objectContaining({
        service_key: serviceKey,
        authority_id: "GMADA",
        fee_type: "BASE_FEE",
        amount: 100,
        description: "Base fee",
      })
    );
  });

  it("fails closed when fee schedule is missing or invalid", async () => {
    const missingService = `fee_calc_missing_${Date.now()}`;
    await expect(calculateFees(missingService, "PUDA")).rejects.toThrow("SERVICE_VERSION_NOT_FOUND");

    const invalidService = `fee_calc_invalid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    createdServiceKeys.add(invalidService);
    await seedServiceVersionWithFeeSchedule(invalidService, {
      default: [{ feeType: "BAD_LINE", amount: -1 }],
    });
    await expect(calculateFees(invalidService, "PUDA")).rejects.toThrow("FEE_SCHEDULE_INVALID_LINE_0");
  });

  it("enforces refund lifecycle transitions (REQUESTED -> APPROVED -> PROCESSED)", async () => {
    const { arn, demandId } = await createDemandFixture(610);
    createdArns.add(arn);
    const payment = await recordPayment({
      arn,
      demandId,
      mode: "COUNTER",
      amount: 610,
      receiptNumber: "RCT-REFUND-001",
    });
    expect(payment.status).toBe("SUCCESS");

    const refund = await createRefundRequest(arn, {
      paymentId: payment.payment_id,
      reason: "Duplicate payment recorded",
      amount: 610,
      requestedBy: TEST_CITIZEN_ID,
    });
    expect(refund.status).toBe("REQUESTED");

    const cannotProcessEarly = await processRefundRequest(refund.refund_id, "test-officer-3");
    expect(cannotProcessEarly?.status).toBe("REQUESTED");

    const approved = await approveRefundRequest(refund.refund_id, "test-officer-3");
    expect(approved?.status).toBe("APPROVED");

    const cannotRejectAfterApproval = await rejectRefundRequest(refund.refund_id, "test-officer-3");
    expect(cannotRejectAfterApproval?.status).toBe("APPROVED");

    const processed = await processRefundRequest(refund.refund_id, "test-officer-3");
    expect(processed?.status).toBe("PROCESSED");

    const latest = await getRefundRequestById(refund.refund_id);
    expect(latest?.processed_at).toBeTruthy();
  });
});
