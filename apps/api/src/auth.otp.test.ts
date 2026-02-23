import path from "path";
import dotenv from "dotenv";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { sendAadharOTP, verifyAadharOTP } from "./auth";
import { query } from "./db";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
process.env.AADHAR_OTP_DEV_BYPASS = "false";

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const OTP_MAX_ATTEMPTS = parsePositiveIntEnv(process.env.OTP_MAX_ATTEMPTS, 5);

function randomAadharIdentifier(): string {
  const tail = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-11);
  return `9${tail}`;
}

describe("Auth OTP hardening", () => {
  let dbReady = false;
  const createdIdentifiers = new Set<string>();

  async function cleanupIdentifier(identifier: string): Promise<void> {
    await query("DELETE FROM otp_store WHERE identifier = $1", [identifier]);
  }

  beforeAll(async () => {
    try {
      await query("SELECT 1");
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[AUTH-OTP-IT] Skipping DB-backed OTP tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) {
      ctx.skip();
    }
  });

  afterEach(async () => {
    for (const identifier of createdIdentifiers) {
      await cleanupIdentifier(identifier);
    }
    createdIdentifiers.clear();
  });

  it("stores only hashed OTP state and clears plaintext value", async () => {
    const identifier = randomAadharIdentifier();
    createdIdentifiers.add(identifier);

    const sendResult = await sendAadharOTP(identifier);
    expect(sendResult.success).toBe(true);

    const stored = await query(
      "SELECT otp, otp_hash, failed_attempts, locked_until FROM otp_store WHERE identifier = $1",
      [identifier]
    );
    expect(stored.rows.length).toBe(1);
    const row = stored.rows[0];
    expect(row.otp).toBeNull();
    expect(typeof row.otp_hash).toBe("string");
    expect((row.otp_hash as string).length).toBe(64);
    expect(Number(row.failed_attempts)).toBe(0);
    expect(row.locked_until).toBeNull();
  });

  it("locks identifier after repeated failed OTP attempts", async () => {
    const identifier = randomAadharIdentifier();
    createdIdentifiers.add(identifier);

    await sendAadharOTP(identifier);
    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      const verified = await verifyAadharOTP(identifier, "000000");
      expect(verified).toBeNull();
    }

    const lockedRowResult = await query(
      "SELECT failed_attempts, locked_until FROM otp_store WHERE identifier = $1",
      [identifier]
    );
    expect(lockedRowResult.rows.length).toBe(1);
    const lockedRow = lockedRowResult.rows[0];
    expect(Number(lockedRow.failed_attempts)).toBe(OTP_MAX_ATTEMPTS);
    expect(lockedRow.locked_until).toBeTruthy();
    expect(new Date(lockedRow.locked_until).getTime()).toBeGreaterThan(Date.now());

    // Additional failed attempts while locked should not increment the counter further.
    await verifyAadharOTP(identifier, "000000");
    const afterLockedAttempt = await query(
      "SELECT failed_attempts FROM otp_store WHERE identifier = $1",
      [identifier]
    );
    expect(Number(afterLockedAttempt.rows[0].failed_attempts)).toBe(OTP_MAX_ATTEMPTS);
  });

  it("resets failed attempt and lock state when issuing a new OTP", async () => {
    const identifier = randomAadharIdentifier();
    createdIdentifiers.add(identifier);

    await sendAadharOTP(identifier);
    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      await verifyAadharOTP(identifier, "000000");
    }

    const lockedBeforeReset = await query(
      "SELECT failed_attempts, locked_until FROM otp_store WHERE identifier = $1",
      [identifier]
    );
    expect(Number(lockedBeforeReset.rows[0].failed_attempts)).toBe(OTP_MAX_ATTEMPTS);
    expect(lockedBeforeReset.rows[0].locked_until).toBeTruthy();

    await sendAadharOTP(identifier);
    const resetRow = await query(
      "SELECT failed_attempts, locked_until, otp, otp_hash FROM otp_store WHERE identifier = $1",
      [identifier]
    );
    expect(Number(resetRow.rows[0].failed_attempts)).toBe(0);
    expect(resetRow.rows[0].locked_until).toBeNull();
    expect(resetRow.rows[0].otp).toBeNull();
    expect(typeof resetRow.rows[0].otp_hash).toBe("string");
  });
});
