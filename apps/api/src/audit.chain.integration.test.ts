import path from "path";
import dotenv from "dotenv";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { query } from "./db";
import { verifyAuditChainIntegrity } from "./audit-chain";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

describe("Audit hash chain integration", () => {
  let dbReady = false;

  beforeAll(async () => {
    try {
      await query("SELECT 1");
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[AUDIT-CHAIN-IT] Skipping DB-backed audit-chain tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) {
      ctx.skip();
    }
  });

  it("stores chain hashes for new audit events and verifies full chain integrity", async () => {
    const eventId = randomUUID();
    await query(
      `INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [
        eventId,
        "AUDIT_CHAIN_TEST_EVENT",
        "SYSTEM",
        "audit-chain-test",
        JSON.stringify({ stamp: Date.now() }),
      ]
    );

    const rowResult = await query(
      `SELECT prev_event_hash, event_hash, hash_version
       FROM audit_event
       WHERE event_id = $1`,
      [eventId]
    );
    expect(rowResult.rows).toHaveLength(1);
    const row = rowResult.rows[0] as {
      prev_event_hash: string | null;
      event_hash: string | null;
      hash_version: string | null;
    };
    expect(typeof row.prev_event_hash).toBe("string");
    expect(typeof row.event_hash).toBe("string");
    expect(row.hash_version).toBe("v1");

    const verification = await verifyAuditChainIntegrity();
    expect(verification.ok).toBe(true);
    expect(verification.checked).toBeGreaterThan(0);
  });
});
