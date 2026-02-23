import { describe, expect, it } from "vitest";
import { evaluateRuntimeAdapterPreflight, runRuntimeAdapterPreflightOrThrow } from "./runtime-adapter-preflight";

function envFixture(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PAYMENT_GATEWAY_PROVIDER: "stub",
    EMAIL_PROVIDER: "stub",
    SMS_PROVIDER: "stub",
    OFFICER_MFA_REQUIRED_ON_DECISION: "false",
    OFFICER_MFA_DELIVERY_CHANNELS: "sms,email",
    PAYMENT_SIGNATURE_REQUIRED: "false",
    EMAIL_ENABLED: "false",
    SMS_ENABLED: "false",
    ...overrides,
  };
}

describe("runtime adapter preflight", () => {
  it("fails production runtime when payment adapter is stub without explicit override", () => {
    expect(() =>
      runRuntimeAdapterPreflightOrThrow(
        envFixture({
          NODE_ENV: "production",
          PAYMENT_GATEWAY_PROVIDER: "stub",
          PAYMENT_GATEWAY_WEBHOOK_SECRET: "prod-secret",
        })
      )
    ).toThrow(/PROD_STUB_PAYMENT_PROVIDER/);
  });

  it("fails razorpay configuration when credentials are missing", () => {
    const result = evaluateRuntimeAdapterPreflight(
      envFixture({
        NODE_ENV: "production",
        PAYMENT_GATEWAY_PROVIDER: "razorpay",
        PAYMENT_GATEWAY_WEBHOOK_SECRET: "prod-secret",
        ALLOW_STUB_PAYMENT_PROVIDER_IN_PRODUCTION: "true",
      })
    );
    expect(result.errors.some((issue) => issue.code === "MISSING_RAZORPAY_KEY_ID")).toBe(true);
    expect(result.errors.some((issue) => issue.code === "MISSING_RAZORPAY_KEY_SECRET")).toBe(true);
  });

  it("fails when MFA is required but delivery providers are effectively disabled", () => {
    expect(() =>
      runRuntimeAdapterPreflightOrThrow(
        envFixture({
          NODE_ENV: "production",
          PAYMENT_GATEWAY_PROVIDER: "razorpay",
          RAZORPAY_KEY_ID: "rzp_key",
          RAZORPAY_KEY_SECRET: "rzp_secret",
          PAYMENT_GATEWAY_WEBHOOK_SECRET: "webhook-secret",
          OFFICER_MFA_REQUIRED_ON_DECISION: "true",
          OFFICER_MFA_DELIVERY_CHANNELS: "email",
          EMAIL_PROVIDER: "smtp",
          SMTP_HOST: "smtp.example.com",
          SMTP_PORT: "587",
          SMTP_FROM: "noreply@example.com",
          EMAIL_ENABLED: "false",
        })
      )
    ).toThrow(/MFA_EMAIL_DISABLED/);
  });

  it("passes strict production profile with real providers and explicit MFA channel", () => {
    const env = envFixture({
      NODE_ENV: "production",
      PAYMENT_GATEWAY_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "rzp_key",
      RAZORPAY_KEY_SECRET: "rzp_secret",
      PAYMENT_GATEWAY_WEBHOOK_SECRET: "webhook-secret",
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_FROM: "noreply@example.com",
      EMAIL_ENABLED: "true",
      OFFICER_MFA_REQUIRED_ON_DECISION: "true",
      OFFICER_MFA_DELIVERY_CHANNELS: "email",
      ALLOW_STUB_SMS_PROVIDER_IN_PRODUCTION: "true",
      ALLOW_STUB_EMAIL_PROVIDER_IN_PRODUCTION: "false",
      ALLOW_STUB_PAYMENT_PROVIDER_IN_PRODUCTION: "false",
    });
    expect(() => runRuntimeAdapterPreflightOrThrow(env)).not.toThrow();
  });

  it("emits warnings in non-production when MFA relies on stub providers", () => {
    const result = evaluateRuntimeAdapterPreflight(
      envFixture({
        NODE_ENV: "development",
        OFFICER_MFA_REQUIRED_ON_DECISION: "true",
        OFFICER_MFA_DELIVERY_CHANNELS: "email,sms",
      })
    );
    expect(result.errors.length).toBe(0);
    expect(result.warnings.some((issue) => issue.code === "MFA_SMS_STUB_PROVIDER")).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "MFA_EMAIL_STUB_PROVIDER")).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "MFA_SMS_DISABLED")).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "MFA_EMAIL_DISABLED")).toBe(true);
  });
});
