import { query } from "./db";
import crypto from "crypto";
import argon2 from "argon2";
import { v4 as uuidv4 } from "uuid";
import { logInfo } from "./logger";
import { isTestRuntime } from "./runtime-safety";

function assertAuthTogglesSafe(): void {
  if (process.env.AADHAR_OTP_DEV_BYPASS === "true" && !isTestRuntime()) {
    throw new Error("FATAL: AADHAR_OTP_DEV_BYPASS is only allowed in test runtime");
  }
}

function isAadharOtpDevBypassEnabled(): boolean {
  return isTestRuntime() && process.env.AADHAR_OTP_DEV_BYPASS === "true";
}

function maskIdentifier(value: string): string {
  if (!value) return "****";
  if (value.length <= 4) return "*".repeat(value.length);
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const OTP_MAX_ATTEMPTS = parsePositiveIntEnv(process.env.OTP_MAX_ATTEMPTS, 5);
const OTP_LOCK_MINUTES = parsePositiveIntEnv(process.env.OTP_LOCK_MINUTES, 15);

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(`otp:${otp}`).digest("hex");
}

assertAuthTogglesSafe();

export interface User {
  user_id: string;
  login: string;
  name: string;
  email?: string;
  phone?: string;
  user_type: "CITIZEN" | "OFFICER" | "ADMIN";
}

export interface UserPosting {
  posting_id: string;
  user_id: string;
  authority_id: string;
  designation_id: string;
  designation_name: string;
  system_role_ids: string[];
}

// B3: Use argon2 for new passwords (OWASP recommended)
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,     // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

// B3: Detect hash format and verify accordingly (backward compatible with PBKDF2)
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // argon2 hashes start with $argon2
  if (hash.startsWith("$argon2")) {
    return argon2.verify(hash, password);
  }
  // Legacy PBKDF2 (salt:key format)
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.pbkdf2(password, salt, 10000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString("hex"));
    });
  });
}

export async function getUserByLogin(login: string): Promise<User | null> {
  const result = await query(
    'SELECT user_id, login, name, email, phone, user_type FROM "user" WHERE login = $1',
    [login]
  );
  return result.rows[0] || null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await query(
    'SELECT user_id, login, name, email, phone, user_type FROM "user" WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function getUserPostings(userId: string): Promise<UserPosting[]> {
  const result = await query(
    `SELECT 
      up.posting_id,
      up.user_id,
      up.authority_id,
      up.designation_id,
      d.designation_name,
      array_agg(drm.system_role_id) as system_role_ids
    FROM user_posting up
    JOIN designation d ON up.designation_id = d.designation_id
    LEFT JOIN designation_role_map drm ON drm.authority_id = up.authority_id AND drm.designation_id = up.designation_id
    WHERE up.user_id = $1 AND (up.active_to IS NULL OR up.active_to > NOW())
    GROUP BY up.posting_id, up.user_id, up.authority_id, up.designation_id, d.designation_name`,
    [userId]
  );
  
  return result.rows.map(row => ({
    ...row,
    system_role_ids: row.system_role_ids.filter((r: string) => r !== null)
  }));
}

export async function createUser(user: {
  login: string;
  password: string;
  name: string;
  email?: string;
  phone?: string;
  user_type: "CITIZEN" | "OFFICER" | "ADMIN";
}): Promise<User> {
  const userId = uuidv4();
  const passwordHash = await hashPassword(user.password);
  
  await query(
    'INSERT INTO "user" (user_id, login, password_hash, name, email, phone, user_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [userId, user.login, passwordHash, user.name, user.email || null, user.phone || null, user.user_type]
  );
  
  return {
    user_id: userId,
    login: user.login,
    name: user.name,
    email: user.email,
    phone: user.phone,
    user_type: user.user_type
  };
}

export async function authenticate(login: string, password: string): Promise<User | null> {
  const result = await query(
    'SELECT user_id, login, password_hash, name, email, phone, user_type FROM "user" WHERE login = $1',
    [login]
  );
  
  if (result.rows.length === 0) return null;
  
  const user = result.rows[0];
  const isValid = await verifyPassword(password, user.password_hash);
  
  if (!isValid) return null;

  // B3: Seamless upgrade — re-hash with argon2 if still using legacy PBKDF2
  if (!user.password_hash.startsWith("$argon2")) {
    const newHash = await hashPassword(password);
    await query('UPDATE "user" SET password_hash = $1 WHERE user_id = $2', [newHash, user.user_id]);
  }
  
  return {
    user_id: user.user_id,
    login: user.login,
    name: user.name,
    email: user.email,
    phone: user.phone,
    user_type: user.user_type
  };
}

// B7: OTP and password-reset tokens stored in database (persists across restarts, multi-instance safe)

export async function sendAadharOTP(aadhar: string): Promise<{ success: boolean; message: string }> {
  // Validate Aadhar format (12 digits)
  if (!/^\d{12}$/.test(aadhar)) {
    return { success: false, message: "Invalid Aadhar number. Must be 12 digits." };
  }

  // Generate cryptographically secure 6-digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Upsert into DB (replaces any previous OTP for same aadhar)
  await query(
    `INSERT INTO otp_store (identifier, otp_hash, otp, expires_at, failed_attempts, locked_until, last_attempt_at)
     VALUES ($1, $2, NULL, $3, 0, NULL, NULL)
     ON CONFLICT (identifier)
     DO UPDATE SET otp_hash = EXCLUDED.otp_hash,
                   otp = NULL,
                   expires_at = EXCLUDED.expires_at,
                   failed_attempts = 0,
                   locked_until = NULL,
                   last_attempt_at = NULL,
                   created_at = NOW()`,
    [aadhar, otpHash, expiresAt.toISOString()]
  );

  // Cleanup expired entries opportunistically
  await query("DELETE FROM otp_store WHERE expires_at < NOW()").catch(() => {});

  // Never log OTP secrets; only log high-level event for traceability.
  logInfo("Aadhar OTP generated", { aadhar: maskIdentifier(aadhar) });

  return { success: true, message: "OTP sent successfully" };
}

export async function verifyAadharOTP(aadhar: string, otp: string): Promise<User | null> {
  const stored = await query(
    "SELECT otp_hash, otp, expires_at, failed_attempts, locked_until FROM otp_store WHERE identifier = $1",
    [aadhar]
  );
  
  if (stored.rows.length === 0) {
    return null; // No OTP found
  }

  const row = stored.rows[0];
  if (row.locked_until && new Date() < new Date(row.locked_until)) {
    return null; // Identifier currently locked due to repeated failures
  }
  if (new Date() > new Date(row.expires_at)) {
    await query("DELETE FROM otp_store WHERE identifier = $1", [aadhar]);
    return null; // OTP expired
  }

  // In test runtime accept any OTP; in all other runtimes verify against stored OTP
  const devBypass = isAadharOtpDevBypassEnabled();
  const inputHash = hashOtp(otp);
  const otpMatches = row.otp_hash ? row.otp_hash === inputHash : row.otp === otp;
  if (!devBypass && !otpMatches) {
    const nextFailedAttempts = Number(row.failed_attempts || 0) + 1;
    if (nextFailedAttempts >= OTP_MAX_ATTEMPTS) {
      await query(
        `UPDATE otp_store
         SET failed_attempts = $2,
             last_attempt_at = NOW(),
             locked_until = NOW() + ($3::text || ' minutes')::interval
         WHERE identifier = $1`,
        [aadhar, nextFailedAttempts, OTP_LOCK_MINUTES]
      );
    } else {
      await query(
        `UPDATE otp_store
         SET failed_attempts = $2,
             last_attempt_at = NOW()
         WHERE identifier = $1`,
        [aadhar, nextFailedAttempts]
      );
    }
    return null; // OTP mismatch
  }

  // Delete used OTP
  await query("DELETE FROM otp_store WHERE identifier = $1", [aadhar]);

  // Find user by Aadhar (stored in phone field for now)
  let result = await query(
    'SELECT user_id, login, name, email, phone, user_type FROM "user" WHERE phone = $1 AND user_type = $2',
    [aadhar, "CITIZEN"]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // For development: if user not found by Aadhar, try to find by login (for test scenarios)
  result = await query(
    'SELECT user_id, login, name, email, phone, user_type FROM "user" WHERE login = $1 AND user_type = $2',
    [aadhar, "CITIZEN"]
  );

  if (result.rows.length > 0) {
    await query('UPDATE "user" SET phone = $1 WHERE user_id = $2', [aadhar, result.rows[0].user_id]);
    return result.rows[0];
  }

  return null;
}

// M7: Hash tokens before storing — prevents exposure if DB is compromised
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(login: string): Promise<{ success: boolean; message: string }> {
  const user = await getUserByLogin(login);
  
  if (!user) {
    return { success: true, message: "If the account exists, a password reset link has been sent." };
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(resetToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // M7: Store hashed token in DB (raw token is sent to user)
  await query(
    `INSERT INTO password_reset_token (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [tokenHash, user.user_id, expiresAt.toISOString()]
  );

  // Cleanup expired tokens opportunistically
  await query("DELETE FROM password_reset_token WHERE expires_at < NOW()").catch(() => {});

  // Never log reset tokens; logs should remain safe even if aggregated externally.
  logInfo("Password reset requested", { login: maskIdentifier(login) });

  return { success: true, message: "If the account exists, a password reset link has been sent." };
}

export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  // M7: Hash the provided token to look it up
  const tokenHash = hashToken(token);
  const result = await query("SELECT user_id, expires_at FROM password_reset_token WHERE token = $1", [tokenHash]);
  
  if (result.rows.length === 0 || new Date() > new Date(result.rows[0].expires_at)) {
    return { success: false, message: "Invalid or expired reset token." };
  }

  const passwordHash = await hashPassword(newPassword);
  
  await query('UPDATE "user" SET password_hash = $1 WHERE user_id = $2', [passwordHash, result.rows[0].user_id]);
  await query("DELETE FROM password_reset_token WHERE token = $1", [tokenHash]);

  return { success: true, message: "Password reset successfully." };
}
