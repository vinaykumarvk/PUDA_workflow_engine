type PreflightLevel = "error" | "warning";

export interface RuntimeAdapterPreflightIssue {
  level: PreflightLevel;
  code: string;
  message: string;
}

export interface RuntimeAdapterPreflightResult {
  errors: RuntimeAdapterPreflightIssue[];
  warnings: RuntimeAdapterPreflightIssue[];
}

type EnvMap = NodeJS.ProcessEnv;

const PAYMENT_PROVIDERS = new Set(["stub", "razorpay"]);
const EMAIL_PROVIDERS = new Set(["stub", "smtp"]);
const SMS_PROVIDERS = new Set(["stub"]);
const MFA_CHANNELS = new Set(["sms", "email"]);

function normalize(value: string | undefined, fallback = ""): string {
  return (value || fallback).trim();
}

function normalizeLower(value: string | undefined, fallback = ""): string {
  return normalize(value, fallback).toLowerCase();
}

function isTruthy(value: string | undefined): boolean {
  return normalizeLower(value) === "true";
}

function isProductionRuntime(env: EnvMap): boolean {
  return normalizeLower(env.NODE_ENV) === "production";
}

function parseMfaChannels(env: EnvMap): string[] {
  const configured = normalizeLower(env.OFFICER_MFA_DELIVERY_CHANNELS, "sms,email");
  return configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function requirePair(
  issues: RuntimeAdapterPreflightIssue[],
  env: EnvMap,
  leftKey: string,
  rightKey: string
): void {
  const left = normalize(env[leftKey]);
  const right = normalize(env[rightKey]);
  if ((left && !right) || (!left && right)) {
    issues.push({
      level: "error",
      code: "MISSING_CREDENTIAL_PAIR",
      message: `${leftKey} and ${rightKey} must be configured together`,
    });
  }
}

function addIssue(
  result: RuntimeAdapterPreflightResult,
  level: PreflightLevel,
  code: string,
  message: string
): void {
  const issue: RuntimeAdapterPreflightIssue = { level, code, message };
  if (level === "error") {
    result.errors.push(issue);
    return;
  }
  result.warnings.push(issue);
}

export function evaluateRuntimeAdapterPreflight(env: EnvMap = process.env): RuntimeAdapterPreflightResult {
  const result: RuntimeAdapterPreflightResult = { errors: [], warnings: [] };

  const paymentProvider = normalizeLower(env.PAYMENT_GATEWAY_PROVIDER, "stub");
  const emailProvider = normalizeLower(env.EMAIL_PROVIDER, "stub");
  const smsProvider = normalizeLower(env.SMS_PROVIDER, "stub");
  const mfaRequired = isTruthy(env.OFFICER_MFA_REQUIRED_ON_DECISION);
  const mfaChannels = parseMfaChannels(env);
  const production = isProductionRuntime(env);

  if (!PAYMENT_PROVIDERS.has(paymentProvider)) {
    addIssue(
      result,
      "error",
      "UNKNOWN_PAYMENT_PROVIDER",
      `Unsupported PAYMENT_GATEWAY_PROVIDER=${paymentProvider}. Supported: stub, razorpay`
    );
  }
  if (!EMAIL_PROVIDERS.has(emailProvider)) {
    addIssue(
      result,
      "error",
      "UNKNOWN_EMAIL_PROVIDER",
      `Unsupported EMAIL_PROVIDER=${emailProvider}. Supported: stub, smtp`
    );
  }
  if (!SMS_PROVIDERS.has(smsProvider)) {
    addIssue(
      result,
      "error",
      "UNKNOWN_SMS_PROVIDER",
      `Unsupported SMS_PROVIDER=${smsProvider}. Supported: stub`
    );
  }

  if (paymentProvider === "razorpay") {
    if (!normalize(env.RAZORPAY_KEY_ID)) {
      addIssue(result, "error", "MISSING_RAZORPAY_KEY_ID", "RAZORPAY_KEY_ID is required for PAYMENT_GATEWAY_PROVIDER=razorpay");
    }
    if (!normalize(env.RAZORPAY_KEY_SECRET)) {
      addIssue(result, "error", "MISSING_RAZORPAY_KEY_SECRET", "RAZORPAY_KEY_SECRET is required for PAYMENT_GATEWAY_PROVIDER=razorpay");
    }
  }

  const signatureRequired = isTruthy(env.PAYMENT_SIGNATURE_REQUIRED) || production;
  if (signatureRequired && !normalize(env.PAYMENT_GATEWAY_WEBHOOK_SECRET)) {
    addIssue(
      result,
      "error",
      "MISSING_PAYMENT_WEBHOOK_SECRET",
      "PAYMENT_GATEWAY_WEBHOOK_SECRET is required when payment signature verification is enforced"
    );
  }

  if (emailProvider === "smtp") {
    if (!normalize(env.SMTP_HOST)) {
      addIssue(result, "error", "MISSING_SMTP_HOST", "SMTP_HOST is required when EMAIL_PROVIDER=smtp");
    }
    if (!normalize(env.SMTP_PORT)) {
      addIssue(result, "error", "MISSING_SMTP_PORT", "SMTP_PORT is required when EMAIL_PROVIDER=smtp");
    }
    if (!normalize(env.SMTP_FROM)) {
      addIssue(result, "error", "MISSING_SMTP_FROM", "SMTP_FROM is required when EMAIL_PROVIDER=smtp");
    }
    requirePair(result.errors, env, "SMTP_USER", "SMTP_PASS");
  }

  for (const channel of mfaChannels) {
    if (!MFA_CHANNELS.has(channel)) {
      addIssue(
        result,
        "error",
        "INVALID_MFA_CHANNEL",
        `Unsupported OFFICER_MFA_DELIVERY_CHANNELS entry "${channel}". Allowed: sms,email`
      );
    }
  }

  if (mfaRequired) {
    if (mfaChannels.length === 0) {
      addIssue(result, "error", "MFA_CHANNELS_EMPTY", "OFFICER_MFA_DELIVERY_CHANNELS must include at least one delivery channel");
    }
    if (mfaChannels.includes("sms")) {
      if (smsProvider === "stub" && !isTruthy(env.ALLOW_STUB_SMS_PROVIDER_IN_PRODUCTION)) {
        addIssue(
          result,
          production ? "error" : "warning",
          "MFA_SMS_STUB_PROVIDER",
          "OFFICER_MFA_REQUIRED_ON_DECISION is enabled but SMS_PROVIDER=stub; configure real SMS provider or explicitly allow stub"
        );
      }
      if (!isTruthy(env.SMS_ENABLED)) {
        addIssue(
          result,
          production ? "error" : "warning",
          "MFA_SMS_DISABLED",
          "OFFICER_MFA_REQUIRED_ON_DECISION requires SMS_ENABLED=true when sms channel is configured"
        );
      }
    }
    if (mfaChannels.includes("email")) {
      if (emailProvider === "stub" && !isTruthy(env.ALLOW_STUB_EMAIL_PROVIDER_IN_PRODUCTION)) {
        addIssue(
          result,
          production ? "error" : "warning",
          "MFA_EMAIL_STUB_PROVIDER",
          "OFFICER_MFA_REQUIRED_ON_DECISION is enabled but EMAIL_PROVIDER=stub; configure SMTP provider or explicitly allow stub"
        );
      }
      if (!isTruthy(env.EMAIL_ENABLED)) {
        addIssue(
          result,
          production ? "error" : "warning",
          "MFA_EMAIL_DISABLED",
          "OFFICER_MFA_REQUIRED_ON_DECISION requires EMAIL_ENABLED=true when email channel is configured"
        );
      }
    }
  }

  if (production) {
    if (paymentProvider === "stub" && !isTruthy(env.ALLOW_STUB_PAYMENT_PROVIDER_IN_PRODUCTION)) {
      addIssue(
        result,
        "error",
        "PROD_STUB_PAYMENT_PROVIDER",
        "PAYMENT_GATEWAY_PROVIDER=stub is not allowed in production unless ALLOW_STUB_PAYMENT_PROVIDER_IN_PRODUCTION=true"
      );
    }
    if (emailProvider === "stub" && isTruthy(env.EMAIL_ENABLED) && !isTruthy(env.ALLOW_STUB_EMAIL_PROVIDER_IN_PRODUCTION)) {
      addIssue(
        result,
        "error",
        "PROD_STUB_EMAIL_PROVIDER",
        "EMAIL_PROVIDER=stub with EMAIL_ENABLED=true is not allowed in production unless ALLOW_STUB_EMAIL_PROVIDER_IN_PRODUCTION=true"
      );
    }
    if (smsProvider === "stub" && isTruthy(env.SMS_ENABLED) && !isTruthy(env.ALLOW_STUB_SMS_PROVIDER_IN_PRODUCTION)) {
      addIssue(
        result,
        "error",
        "PROD_STUB_SMS_PROVIDER",
        "SMS_PROVIDER=stub with SMS_ENABLED=true is not allowed in production unless ALLOW_STUB_SMS_PROVIDER_IN_PRODUCTION=true"
      );
    }
  }

  return result;
}

export function runRuntimeAdapterPreflightOrThrow(env: EnvMap = process.env): void {
  const result = evaluateRuntimeAdapterPreflight(env);
  if (result.errors.length === 0) {
    return;
  }
  const details = result.errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
  throw new Error(`[RUNTIME_ADAPTER_PREFLIGHT_FAILED] ${details}`);
}
