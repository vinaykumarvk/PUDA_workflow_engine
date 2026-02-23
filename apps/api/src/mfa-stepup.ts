import { randomInt, randomUUID, createHash } from "node:crypto";
import { query } from "./db";
import { logInfo, logWarn } from "./logger";
import { createEmailTransport } from "./transports/email";
import { createSmsTransport } from "./transports/sms";
import { isTestRuntime } from "./runtime-safety";

export const MFA_PURPOSE_TASK_DECISION = "TASK_DECISION" as const;

export type MfaChallengePurpose = typeof MFA_PURPOSE_TASK_DECISION;

type DeliveryChannel = "SMS" | "EMAIL";

export interface IssueMfaChallengeInput {
  userId: string;
  purpose: MfaChallengePurpose;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface IssueMfaChallengeResult {
  challengeId: string;
  expiresAt: string;
  deliveryChannels: DeliveryChannel[];
  debugCode?: string;
}

export type VerifyMfaErrorCode =
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_ALREADY_USED"
  | "CHALLENGE_LOCKED"
  | "TASK_MISMATCH"
  | "INVALID_CODE";

export interface VerifyMfaChallengeInput {
  challengeId: string;
  userId: string;
  purpose: MfaChallengePurpose;
  code: string;
  taskId?: string;
}

export interface VerifyMfaChallengeResult {
  ok: boolean;
  error?: VerifyMfaErrorCode;
}

const smsTransport = createSmsTransport();
const emailTransport = createEmailTransport();

function assertMfaDebugSafe(): void {
  if (!isTestRuntime() && process.env.MFA_DEBUG_RETURN_CODE === "true") {
    throw new Error("FATAL: MFA_DEBUG_RETURN_CODE is only allowed in test runtime");
  }
}

function hashMfaCode(code: string): string {
  return createHash("sha256").update(`mfa:${code}`).digest("hex");
}

function getMfaCodeTtlMinutes(): number {
  const parsed = Number.parseInt(process.env.OFFICER_MFA_CODE_TTL_MINUTES || "10", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return parsed;
}

function getMfaMaxAttempts(): number {
  const parsed = Number.parseInt(process.env.OFFICER_MFA_MAX_ATTEMPTS || "5", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return parsed;
}

function getRequestedChannels(): DeliveryChannel[] {
  const configured = (process.env.OFFICER_MFA_DELIVERY_CHANNELS || "sms,email")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const channels: DeliveryChannel[] = [];
  for (const entry of configured) {
    if (entry === "sms" && !channels.includes("SMS")) channels.push("SMS");
    if (entry === "email" && !channels.includes("EMAIL")) channels.push("EMAIL");
  }
  if (channels.length === 0) {
    channels.push("SMS");
  }
  return channels;
}

function shouldReturnDebugCode(): boolean {
  if (!isTestRuntime()) {
    return false;
  }
  const explicit = process.env.MFA_DEBUG_RETURN_CODE;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return true;
}

assertMfaDebugSafe();

async function sendMfaCode(
  channel: DeliveryChannel,
  userId: string,
  code: string,
  ttlMinutes: number,
  challengeId: string,
  purpose: MfaChallengePurpose,
  taskId?: string
): Promise<void> {
  const title = "PUDA Security Verification";
  const message = `Your PUDA verification code is ${code}. It expires in ${ttlMinutes} minutes.`;
  const metadata = {
    security: true,
    challengeId,
    purpose,
    taskId: taskId || null,
  };
  if (channel === "SMS") {
    await smsTransport.send(userId, title, message, metadata);
    return;
  }
  await emailTransport.send(userId, title, message, metadata);
}

export async function issueMfaChallenge(
  input: IssueMfaChallengeInput
): Promise<IssueMfaChallengeResult> {
  const challengeId = randomUUID();
  const code = randomInt(100000, 1000000).toString();
  const codeHash = hashMfaCode(code);
  const ttlMinutes = getMfaCodeTtlMinutes();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const maxAttempts = getMfaMaxAttempts();
  const channels = getRequestedChannels();

  await query(
    `INSERT INTO auth_mfa_challenge
      (challenge_id, user_id, purpose, task_id, code_hash, expires_at, max_attempts, delivery_channels, metadata_jsonb)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      challengeId,
      input.userId,
      input.purpose,
      input.taskId || null,
      codeHash,
      expiresAt.toISOString(),
      maxAttempts,
      channels,
      JSON.stringify(input.metadata || {}),
    ]
  );

  const deliveredChannels: DeliveryChannel[] = [];
  for (const channel of channels) {
    try {
      await sendMfaCode(
        channel,
        input.userId,
        code,
        ttlMinutes,
        challengeId,
        input.purpose,
        input.taskId
      );
      deliveredChannels.push(channel);
    } catch (error) {
      logWarn("MFA challenge delivery failed", {
        challengeId,
        channel,
        purpose: input.purpose,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logInfo("MFA challenge issued", {
    challengeId,
    userId: input.userId,
    purpose: input.purpose,
    taskId: input.taskId || null,
    deliveredChannels,
  });

  return {
    challengeId,
    expiresAt: expiresAt.toISOString(),
    deliveryChannels: deliveredChannels,
    ...(shouldReturnDebugCode() ? { debugCode: code } : {}),
  };
}

export async function verifyMfaChallenge(
  input: VerifyMfaChallengeInput
): Promise<VerifyMfaChallengeResult> {
  const challengeResult = await query(
    `SELECT challenge_id, task_id, code_hash, expires_at, consumed_at, attempt_count, max_attempts
     FROM auth_mfa_challenge
     WHERE challenge_id = $1 AND user_id = $2 AND purpose = $3`,
    [input.challengeId, input.userId, input.purpose]
  );
  if (challengeResult.rows.length === 0) {
    return { ok: false, error: "CHALLENGE_NOT_FOUND" };
  }

  const row = challengeResult.rows[0] as {
    challenge_id: string;
    task_id: string | null;
    code_hash: string;
    expires_at: Date;
    consumed_at: Date | null;
    attempt_count: number;
    max_attempts: number;
  };

  if (row.task_id && input.taskId && row.task_id !== input.taskId) {
    return { ok: false, error: "TASK_MISMATCH" };
  }

  if (row.consumed_at) {
    return { ok: false, error: "CHALLENGE_ALREADY_USED" };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "CHALLENGE_EXPIRED" };
  }

  if (row.attempt_count >= row.max_attempts) {
    return { ok: false, error: "CHALLENGE_LOCKED" };
  }

  const inputHash = hashMfaCode(input.code);
  if (inputHash !== row.code_hash) {
    await query(
      `UPDATE auth_mfa_challenge
       SET attempt_count = attempt_count + 1
       WHERE challenge_id = $1`,
      [row.challenge_id]
    );
    return { ok: false, error: "INVALID_CODE" };
  }

  await query(
    `UPDATE auth_mfa_challenge
     SET consumed_at = NOW()
     WHERE challenge_id = $1`,
    [row.challenge_id]
  );

  return { ok: true };
}

export async function cleanupExpiredMfaChallenges(): Promise<number> {
  try {
    const result = await query(
      `DELETE FROM auth_mfa_challenge
       WHERE expires_at <= NOW()
         AND consumed_at IS NULL`
    );
    return result.rowCount || 0;
  } catch (error) {
    logWarn("Failed to cleanup expired MFA challenges", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
