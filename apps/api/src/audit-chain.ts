import { createHash } from "node:crypto";
import { query } from "./db";

interface AuditChainRow {
  chain_position: number;
  event_id: string;
  arn: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload_jsonb_text: string;
  created_at_hash_text: string;
  prev_event_hash: string | null;
  event_hash: string | null;
}

export interface AuditChainMismatch {
  index: number;
  chainPosition: number;
  eventId: string;
  reason: "PREV_HASH_MISMATCH" | "EVENT_HASH_MISMATCH" | "HASH_MISSING";
  expectedPrevHash: string;
  actualPrevHash: string | null;
  expectedEventHash: string;
  actualEventHash: string | null;
}

export interface AuditChainVerificationResult {
  ok: boolean;
  checked: number;
  mismatch?: AuditChainMismatch;
}

function computeAuditEventHash(input: {
  eventId: string;
  arn: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  payloadJsonText: string;
  createdAtHashText: string;
  prevHash: string;
}): string {
  const canonical = [
    input.eventId,
    input.arn || "",
    input.eventType || "",
    input.actorType || "",
    input.actorId || "",
    input.payloadJsonText || "{}",
    input.createdAtHashText,
    input.prevHash,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export async function verifyAuditChainIntegrity(): Promise<AuditChainVerificationResult> {
  const result = await query(
    `SELECT event_id, arn, event_type, actor_type, actor_id,
            chain_position,
            COALESCE(payload_jsonb::text, '{}'::text) AS payload_jsonb_text,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_hash_text,
            prev_event_hash, event_hash
     FROM audit_event
     ORDER BY chain_position ASC`
  );

  const rows = result.rows as AuditChainRow[];
  let runningPrevHash = "GENESIS";
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expectedEventHash = computeAuditEventHash({
      eventId: row.event_id,
      arn: row.arn,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      payloadJsonText: row.payload_jsonb_text,
      createdAtHashText: row.created_at_hash_text,
      prevHash: runningPrevHash,
    });

    if (!row.prev_event_hash || !row.event_hash) {
      return {
        ok: false,
        checked: index,
        mismatch: {
          index,
          chainPosition: row.chain_position,
          eventId: row.event_id,
          reason: "HASH_MISSING",
          expectedPrevHash: runningPrevHash,
          actualPrevHash: row.prev_event_hash,
          expectedEventHash,
          actualEventHash: row.event_hash,
        },
      };
    }
    if (row.prev_event_hash !== runningPrevHash) {
      return {
        ok: false,
        checked: index,
        mismatch: {
          index,
          chainPosition: row.chain_position,
          eventId: row.event_id,
          reason: "PREV_HASH_MISMATCH",
          expectedPrevHash: runningPrevHash,
          actualPrevHash: row.prev_event_hash,
          expectedEventHash,
          actualEventHash: row.event_hash,
        },
      };
    }
    if (row.event_hash !== expectedEventHash) {
      return {
        ok: false,
        checked: index,
        mismatch: {
          index,
          chainPosition: row.chain_position,
          eventId: row.event_id,
          reason: "EVENT_HASH_MISMATCH",
          expectedPrevHash: runningPrevHash,
          actualPrevHash: row.prev_event_hash,
          expectedEventHash,
          actualEventHash: row.event_hash,
        },
      };
    }

    runningPrevHash = row.event_hash;
  }

  return { ok: true, checked: rows.length };
}
