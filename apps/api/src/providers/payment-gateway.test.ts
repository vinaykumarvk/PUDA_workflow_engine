import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetPaymentGatewayAdapterForTests,
  resolvePaymentGatewayAdapter,
} from "./payment-gateway";

const ORIGINAL_PROVIDER = process.env.PAYMENT_GATEWAY_PROVIDER;
const ORIGINAL_SIGNATURE_REQUIRED = process.env.PAYMENT_SIGNATURE_REQUIRED;
const ORIGINAL_SECRET = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;

function sign(secret: string, orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

afterEach(() => {
  process.env.PAYMENT_GATEWAY_PROVIDER = ORIGINAL_PROVIDER;
  process.env.PAYMENT_SIGNATURE_REQUIRED = ORIGINAL_SIGNATURE_REQUIRED;
  process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = ORIGINAL_SECRET;
  resetPaymentGatewayAdapterForTests();
});

describe("payment gateway adapter (runtime stub)", () => {
  it("creates stub gateway order details by default", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    const adapter = resolvePaymentGatewayAdapter();
    const order = await adapter.createOrder({
      paymentId: "payment_12345678",
      arn: "ARN-1",
      demandId: "demand-1",
      amount: 250,
      currency: "INR",
    });

    expect(adapter.name).toBe("STUB_GATEWAY");
    expect(order.gatewayOrderId).toMatch(/^stub_order_/);
    expect(order.providerName).toBe("STUB_GATEWAY");
    expect(order.providerTransactionId).toMatch(/^stub_txn_/);
  });

  it("verifies signatures when secret is configured", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = "unit-test-secret";
    const adapter = resolvePaymentGatewayAdapter();

    const gatewayOrderId = "order_1";
    const gatewayPaymentId = "pay_1";
    const gatewaySignature = sign("unit-test-secret", gatewayOrderId, gatewayPaymentId);
    const result = await adapter.verifyCallbackSignature({
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    });
    expect(result).toEqual(
      expect.objectContaining({
        verified: true,
        normalizedSignature: gatewaySignature,
      })
    );
  });

  it("returns config error when signature is required but secret missing", async () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = "stub";
    process.env.PAYMENT_SIGNATURE_REQUIRED = "true";
    delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
    const adapter = resolvePaymentGatewayAdapter();

    const result = await adapter.verifyCallbackSignature({
      gatewayOrderId: "order_2",
      gatewayPaymentId: "pay_2",
      gatewaySignature: "deadbeef",
    });
    expect(result).toEqual({
      verified: false,
      errorCode: "PAYMENT_SIGNATURE_SECRET_NOT_CONFIGURED",
    });
  });
});
