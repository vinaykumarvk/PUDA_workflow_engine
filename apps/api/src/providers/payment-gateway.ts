import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { logWarn } from "../logger";
import { resilientFetch } from "../http-client";

export type PaymentGatewayVerificationErrorCode =
  | "INVALID_GATEWAY_SIGNATURE"
  | "PAYMENT_SIGNATURE_SECRET_NOT_CONFIGURED";

export interface PaymentGatewayCreateOrderInput {
  paymentId: string;
  arn: string;
  demandId?: string;
  amount: number;
  currency: string;
}

export interface PaymentGatewayCreateOrderResult {
  gatewayOrderId: string;
  providerTransactionId?: string;
  providerName?: string;
}

export interface PaymentGatewayVerifySignatureInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export interface PaymentGatewayVerifySignatureResult {
  verified: boolean;
  normalizedSignature?: string;
  errorCode?: PaymentGatewayVerificationErrorCode;
}

export interface PaymentGatewayAdapter {
  readonly name: string;
  createOrder(input: PaymentGatewayCreateOrderInput): Promise<PaymentGatewayCreateOrderResult>;
  verifyCallbackSignature(
    input: PaymentGatewayVerifySignatureInput
  ): Promise<PaymentGatewayVerifySignatureResult>;
}

function shouldRequireGatewaySignature(): boolean {
  return process.env.PAYMENT_SIGNATURE_REQUIRED === "true" || process.env.NODE_ENV === "production";
}

function getGatewayWebhookSecret(): string | null {
  const secret = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : null;
}

function normalizeSignature(signature: string): string {
  return signature.replace(/^sha256=/i, "").trim().toLowerCase();
}

function verifyHmacSignature(
  gatewayOrderId: string,
  gatewayPaymentId: string,
  gatewaySignature: string,
  webhookSecret: string
): { verified: boolean; normalizedSignature: string } {
  const normalizedSignature = normalizeSignature(gatewaySignature);
  if (!/^[0-9a-f]+$/i.test(normalizedSignature) || normalizedSignature.length % 2 !== 0) {
    return { verified: false, normalizedSignature };
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(normalizedSignature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return { verified: false, normalizedSignature };
  }
  return {
    verified: crypto.timingSafeEqual(expectedBuffer, receivedBuffer),
    normalizedSignature,
  };
}

class RazorpayPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly name = "RAZORPAY";

  private getCredentials() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured");
    }
    return { keyId, keySecret };
  }

  async createOrder(input: PaymentGatewayCreateOrderInput): Promise<PaymentGatewayCreateOrderResult> {
    const { keyId, keySecret } = this.getCredentials();
    const body = JSON.stringify({
      amount: Math.round(input.amount * 100),
      currency: input.currency || "INR",
      receipt: input.paymentId,
      notes: { arn: input.arn, demandId: input.demandId || "" },
    });

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await resilientFetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body,
      timeoutMs: 15_000,
      maxRetries: 2,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Razorpay order creation failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as { id: string };
    return {
      gatewayOrderId: data.id,
      providerTransactionId: data.id,
      providerName: this.name,
    };
  }

  async verifyCallbackSignature(
    input: PaymentGatewayVerifySignatureInput
  ): Promise<PaymentGatewayVerifySignatureResult> {
    const { keySecret } = this.getCredentials();
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
      .digest("hex");

    const receivedSig = normalizeSignature(input.gatewaySignature);
    if (!/^[0-9a-f]+$/i.test(receivedSig) || receivedSig.length % 2 !== 0) {
      return { verified: false, normalizedSignature: receivedSig, errorCode: "INVALID_GATEWAY_SIGNATURE" };
    }

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(receivedSig, "hex");
    if (expectedBuffer.length !== receivedBuffer.length) {
      return { verified: false, normalizedSignature: receivedSig, errorCode: "INVALID_GATEWAY_SIGNATURE" };
    }

    const verified = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    if (!verified) {
      return { verified: false, normalizedSignature: receivedSig, errorCode: "INVALID_GATEWAY_SIGNATURE" };
    }
    return { verified: true, normalizedSignature: receivedSig };
  }
}

class StubPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly name = "STUB_GATEWAY";

  async createOrder(input: PaymentGatewayCreateOrderInput): Promise<PaymentGatewayCreateOrderResult> {
    const orderSuffix = uuidv4().replace(/-/g, "").slice(0, 12);
    return {
      gatewayOrderId: `stub_order_${input.paymentId.slice(0, 8)}_${orderSuffix}`,
      providerTransactionId: `stub_txn_${orderSuffix}`,
      providerName: this.name,
    };
  }

  async verifyCallbackSignature(
    input: PaymentGatewayVerifySignatureInput
  ): Promise<PaymentGatewayVerifySignatureResult> {
    const webhookSecret = getGatewayWebhookSecret();
    if (!webhookSecret) {
      if (shouldRequireGatewaySignature()) {
        return {
          verified: false,
          errorCode: "PAYMENT_SIGNATURE_SECRET_NOT_CONFIGURED",
        };
      }
      return {
        verified: true,
        normalizedSignature: normalizeSignature(input.gatewaySignature),
      };
    }

    const verification = verifyHmacSignature(
      input.gatewayOrderId,
      input.gatewayPaymentId,
      input.gatewaySignature,
      webhookSecret
    );
    if (!verification.verified) {
      return {
        verified: false,
        normalizedSignature: verification.normalizedSignature,
        errorCode: "INVALID_GATEWAY_SIGNATURE",
      };
    }
    return { verified: true, normalizedSignature: verification.normalizedSignature };
  }
}

let cachedAdapter: PaymentGatewayAdapter | null = null;

export function resolvePaymentGatewayAdapter(): PaymentGatewayAdapter {
  if (cachedAdapter) return cachedAdapter;

  const configuredProvider = (process.env.PAYMENT_GATEWAY_PROVIDER || "stub").trim().toLowerCase();
  switch (configuredProvider) {
    case "razorpay":
      cachedAdapter = new RazorpayPaymentGatewayAdapter();
      break;
    case "stub":
      cachedAdapter = new StubPaymentGatewayAdapter();
      break;
    default:
      logWarn("Unknown PAYMENT_GATEWAY_PROVIDER configured, using stub adapter", {
        provider: configuredProvider,
      });
      cachedAdapter = new StubPaymentGatewayAdapter();
      break;
  }
  return cachedAdapter;
}

export function resetPaymentGatewayAdapterForTests(): void {
  cachedAdapter = null;
}
