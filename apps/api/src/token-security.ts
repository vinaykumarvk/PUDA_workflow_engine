import { query } from "./db";
import { logWarn } from "./logger";

export interface TokenSecurityClaims {
  userId: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface TokenRevocationCheckResult {
  revoked: boolean;
  reason?: "MISSING_JTI" | "TOKEN_DENYLISTED" | "TOKEN_CUTOFF_REVOKED";
}

export interface RevokeTokenInput {
  userId: string;
  jti: string;
  exp?: number;
  reason?: string;
  revokedByUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface RevokeAllUserTokensInput {
  userId: string;
  reason?: string;
  updatedByUserId?: string;
}

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function enforceJtiClaim(): boolean {
  const explicit = process.env.JWT_ENFORCE_JTI;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return !isTestRuntime();
}

function normalizeEpochSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  if (normalized <= 0) return undefined;
  return normalized;
}

export async function checkTokenRevocation(
  claims: TokenSecurityClaims
): Promise<TokenRevocationCheckResult> {
  const normalizedJti = claims.jti?.trim();
  if (enforceJtiClaim() && !normalizedJti) {
    return { revoked: true, reason: "MISSING_JTI" };
  }

  // PERF-013: Single query checks both denylist and user-level cutoff revocation
  const issuedAt = normalizeEpochSeconds(claims.iat);
  const result = await query(
    `SELECT
       COALESCE((
         SELECT TRUE FROM auth_token_denylist
         WHERE jti = $1 AND expires_at > NOW()
         LIMIT 1
       ), FALSE) AS token_denylisted,
       (
         SELECT FLOOR(EXTRACT(EPOCH FROM revoked_before))::bigint
         FROM user_token_security
         WHERE user_id = $2
       ) AS revoked_before_epoch`,
    [normalizedJti || null, claims.userId]
  );

  const row = result.rows[0];
  if (row?.token_denylisted === true) {
    return { revoked: true, reason: "TOKEN_DENYLISTED" };
  }

  if (issuedAt && row?.revoked_before_epoch != null) {
    const normalizedCutoff = Number.parseInt(String(row.revoked_before_epoch), 10);
    if (Number.isFinite(normalizedCutoff) && issuedAt <= normalizedCutoff) {
      return { revoked: true, reason: "TOKEN_CUTOFF_REVOKED" };
    }
  }

  return { revoked: false };
}

export async function revokeToken(input: RevokeTokenInput): Promise<void> {
  const expiresAtIso = input.exp
    ? new Date(input.exp * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await query(
    `INSERT INTO auth_token_denylist
      (jti, user_id, expires_at, reason, revoked_by_user_id, metadata_jsonb)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (jti) DO UPDATE
       SET reason = COALESCE(auth_token_denylist.reason, EXCLUDED.reason),
           revoked_by_user_id = COALESCE(auth_token_denylist.revoked_by_user_id, EXCLUDED.revoked_by_user_id),
           metadata_jsonb = auth_token_denylist.metadata_jsonb || EXCLUDED.metadata_jsonb`,
    [
      input.jti,
      input.userId,
      expiresAtIso,
      input.reason || null,
      input.revokedByUserId || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
}

export async function revokeAllUserTokens(
  input: RevokeAllUserTokensInput
): Promise<{ revokedBefore: Date }> {
  const result = await query(
    `INSERT INTO user_token_security (user_id, revoked_before, reason, updated_by_user_id, updated_at)
     VALUES ($1, NOW(), $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET revoked_before = GREATEST(user_token_security.revoked_before, EXCLUDED.revoked_before),
           reason = EXCLUDED.reason,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()
     RETURNING revoked_before`,
    [input.userId, input.reason || null, input.updatedByUserId || null]
  );

  const revokedBefore = result.rows[0]?.revoked_before;
  if (!revokedBefore) {
    throw new Error("FAILED_TO_SET_USER_TOKEN_CUTOFF");
  }
  return { revokedBefore: new Date(revokedBefore) };
}

export async function cleanupExpiredRevocations(): Promise<number> {
  try {
    const result = await query(
      `DELETE FROM auth_token_denylist
       WHERE expires_at <= NOW()`
    );
    return result.rowCount || 0;
  } catch (error) {
    logWarn("Failed to cleanup expired token revocations", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
