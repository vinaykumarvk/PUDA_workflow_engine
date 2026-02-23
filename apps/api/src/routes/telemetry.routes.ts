import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import { query } from "../db";
import { getAuthUserId, send400 } from "../errors";

type CacheTelemetryCounter =
  | "cache_fallback_offline"
  | "cache_fallback_error"
  | "stale_data_served";

type CacheTelemetryRequestBody = {
  app: "citizen";
  clientUpdatedAt: string;
  counterDelta: Record<CacheTelemetryCounter, number>;
  sourceDelta: Record<string, number>;
  userId?: string; // test-mode fallback only
};

const cacheTelemetrySchema = {
  body: {
    type: "object",
    required: ["app", "clientUpdatedAt", "counterDelta", "sourceDelta"],
    additionalProperties: false,
    properties: {
      app: { type: "string", enum: ["citizen"] },
      clientUpdatedAt: { type: "string", format: "date-time" },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
      counterDelta: {
        type: "object",
        required: ["cache_fallback_offline", "cache_fallback_error", "stale_data_served"],
        additionalProperties: false,
        properties: {
          cache_fallback_offline: { type: "integer", minimum: 0, maximum: 1000000 },
          cache_fallback_error: { type: "integer", minimum: 0, maximum: 1000000 },
          stale_data_served: { type: "integer", minimum: 0, maximum: 1000000 }
        }
      },
      sourceDelta: {
        type: "object",
        maxProperties: 200,
        propertyNames: { pattern: "^[a-z0-9_:\\-]{1,80}$" },
        additionalProperties: { type: "integer", minimum: 0, maximum: 1000000 }
      }
    }
  }
} as const;

function totalCounterDelta(counterDelta: Record<CacheTelemetryCounter, number>): number {
  return (
    Number(counterDelta.cache_fallback_offline || 0) +
    Number(counterDelta.cache_fallback_error || 0) +
    Number(counterDelta.stale_data_served || 0)
  );
}

function totalSourceDelta(sourceDelta: Record<string, number>): number {
  return Object.values(sourceDelta).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function resolveAuthorityScopeForActor(
  actorId: string,
  actorType: string,
  actorPostings: Array<{ authority_id: string }> | undefined
): Promise<string[]> {
  const postingAuthorities = Array.from(
    new Set(
      (actorPostings || [])
        .map((posting) => posting.authority_id)
        .filter((authorityId): authorityId is string => Boolean(authorityId))
    )
  );
  if (postingAuthorities.length > 0) return postingAuthorities;
  if (actorType !== "CITIZEN") return [];
  const appAuthorities = await query(
    `SELECT DISTINCT authority_id
     FROM application
     WHERE applicant_user_id = $1
     ORDER BY authority_id
     LIMIT 20`,
    [actorId]
  );
  return appAuthorities.rows
    .map((row: any) => String(row.authority_id || "").trim())
    .filter((authorityId: string) => authorityId.length > 0);
}

export async function registerTelemetryRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/client-telemetry/cache",
    { schema: cacheTelemetrySchema, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body as CacheTelemetryRequestBody;
      const actorId = getAuthUserId(request, "userId");
      if (!actorId) {
        reply.code(400);
        return send400(reply, "USER_ID_REQUIRED");
      }

      const deltaTotal = totalCounterDelta(body.counterDelta) + totalSourceDelta(body.sourceDelta);
      if (deltaTotal <= 0) {
        reply.code(200);
        return { accepted: false, reason: "NO_DELTA" };
      }

      const eventId = randomUUID();
      const actorType = request.authUser?.userType || "CITIZEN";
      const userAgent = request.headers["user-agent"] || null;
      const authorityScope = await resolveAuthorityScopeForActor(
        actorId,
        actorType,
        request.authUser?.postings
      );
      const payload = {
        app: body.app,
        clientUpdatedAt: body.clientUpdatedAt,
        receivedAt: new Date().toISOString(),
        counterDelta: body.counterDelta,
        sourceDelta: body.sourceDelta,
        totalDelta: deltaTotal,
        authorityScope
      };

      await query(
        `INSERT INTO audit_event
           (event_id, arn, event_type, actor_type, actor_id, ip_address, user_agent, payload_jsonb)
         VALUES
           ($1, NULL, 'CLIENT_CACHE_TELEMETRY', $2, $3, $4, $5, $6::jsonb)`,
        [
          eventId,
          actorType,
          actorId,
          request.ip || null,
          userAgent,
          JSON.stringify(payload)
        ]
      );

      reply.code(202);
      return { accepted: true, eventId };
    }
  );
}
