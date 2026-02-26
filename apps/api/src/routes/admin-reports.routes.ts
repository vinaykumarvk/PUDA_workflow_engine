/**
 * Admin sub-module: reports & analytics routes (stats, telemetry).
 * Split from admin.routes.ts — shares hooks/helpers via the barrel.
 */
import { FastifyInstance } from "fastify";
import { query } from "../db";
import { send400 } from "../errors";
import { requireValidAuthorityId } from "../route-access";
import { resolveOfficerAuthorityScope, parsePositiveInteger } from "./admin.routes";

const authorityScopedReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
    },
  },
};

const cacheTelemetryReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      bucketMinutes: { type: "string", pattern: "^(5|15|30|60|180|360|720|1440)$" },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      sourceLimit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    },
  },
};

export async function registerAdminReportRoutes(app: FastifyInstance) {
  // --- System Stats ---
  app.get("/api/v1/admin/stats", { schema: authorityScopedReadSchema }, async (request, reply) => {
    const requestedAuthorityId = (request.query as any).authorityId;
    const scopedAuthorityId = resolveOfficerAuthorityScope(
      request,
      reply,
      requestedAuthorityId,
      "view stats"
    );
    if (scopedAuthorityId === null) return;
    if (request.authUser?.userType === "ADMIN" && scopedAuthorityId) {
      const authorityExists = await requireValidAuthorityId(reply, scopedAuthorityId);
      if (!authorityExists) return;
    }
    if (request.authUser?.userType === "OFFICER" || scopedAuthorityId) {
      const authorityIds = scopedAuthorityId ? [scopedAuthorityId] : [];
      const [users, apps, tasks, services] = await Promise.all([
        query(
          `SELECT u.user_type, COUNT(DISTINCT u.user_id) as count
           FROM "user" u
           JOIN user_posting up ON up.user_id = u.user_id
           WHERE up.authority_id = ANY($1)
           GROUP BY u.user_type`,
          [authorityIds]
        ),
        query(
          "SELECT state_id, COUNT(*) as count FROM application WHERE authority_id = ANY($1) GROUP BY state_id",
          [authorityIds]
        ),
        query(
          `SELECT t.status, COUNT(*) as count
           FROM task t
           JOIN application a ON a.arn = t.arn
           WHERE a.authority_id = ANY($1)
           GROUP BY t.status`,
          [authorityIds]
        ),
        query(
          "SELECT service_key, COUNT(*) as count FROM application WHERE authority_id = ANY($1) GROUP BY service_key",
          [authorityIds]
        ),
      ]);
      return {
        users: users.rows,
        applicationsByState: apps.rows,
        tasksByStatus: tasks.rows,
        applicationsByService: services.rows,
      };
    }

    const [users, apps, tasks, services] = await Promise.all([
      query('SELECT user_type, COUNT(*) as count FROM "user" GROUP BY user_type'),
      query("SELECT state_id, COUNT(*) as count FROM application GROUP BY state_id"),
      query("SELECT status, COUNT(*) as count FROM task GROUP BY status"),
      query("SELECT service_key, COUNT(*) as count FROM application GROUP BY service_key"),
    ]);
    return {
      users: users.rows,
      applicationsByState: apps.rows,
      tasksByStatus: tasks.rows,
      applicationsByService: services.rows,
    };
  });

  app.get("/api/v1/admin/telemetry/cache", { schema: cacheTelemetryReadSchema }, async (request, reply) => {
    const queryParams = request.query as {
      authorityId?: string;
      from?: string;
      to?: string;
      bucketMinutes?: string;
      limit?: string;
      sourceLimit?: string;
    };
    const requestedAuthorityId = queryParams.authorityId;
    const scopedAuthorityId = resolveOfficerAuthorityScope(
      request,
      reply,
      requestedAuthorityId,
      "view cache telemetry"
    );
    if (scopedAuthorityId === null) return;
    if (request.authUser?.userType === "ADMIN" && scopedAuthorityId) {
      const authorityExists = await requireValidAuthorityId(reply, scopedAuthorityId);
      if (!authorityExists) return;
    }

    const now = new Date();
    const from = queryParams.from ? new Date(queryParams.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = queryParams.to ? new Date(queryParams.to) : now;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      return reply.send(
        send400(
          reply,
          "INVALID_QUERY_PARAMS",
          "from/to must be valid ISO timestamps and from must be <= to"
        )
      );
    }
    const rangeMs = to.getTime() - from.getTime();
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
    if (rangeMs > maxRangeMs) {
      return reply.send(
        send400(
          reply,
          "INVALID_QUERY_PARAMS",
          "Telemetry range cannot exceed 31 days"
        )
      );
    }

    const bucketMinutes = parsePositiveInteger(queryParams.bucketMinutes, 60);
    const limit = Math.min(parsePositiveInteger(queryParams.limit, 96), 500);
    const sourceLimit = Math.min(parsePositiveInteger(queryParams.sourceLimit, 20), 100);
    const authorityScopeIds = scopedAuthorityId ? [scopedAuthorityId] : null;

    const bucketResult = await query(
      `WITH filtered AS (
         SELECT ae.created_at, ae.payload_jsonb
         FROM audit_event ae
         WHERE ae.event_type = 'CLIENT_CACHE_TELEMETRY'
           AND ae.created_at >= $2::timestamptz
           AND ae.created_at <= $3::timestamptz
           AND (
             $4::text[] IS NULL OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(COALESCE(ae.payload_jsonb->'authorityScope', '[]'::jsonb)) scope(value)
               WHERE scope.value = ANY($4)
             )
           )
       ),
       bucketed AS (
         SELECT
           to_timestamp(
             floor(extract(epoch FROM created_at) / ($1::int * 60)) * ($1::int * 60)
           ) AS bucket_start,
           COALESCE((payload_jsonb->'counterDelta'->>'cache_fallback_offline')::bigint, 0) AS cache_fallback_offline,
           COALESCE((payload_jsonb->'counterDelta'->>'cache_fallback_error')::bigint, 0) AS cache_fallback_error,
           COALESCE((payload_jsonb->'counterDelta'->>'stale_data_served')::bigint, 0) AS stale_data_served
         FROM filtered
       )
       SELECT
         bucket_start,
         SUM(cache_fallback_offline)::bigint AS cache_fallback_offline,
         SUM(cache_fallback_error)::bigint AS cache_fallback_error,
         SUM(stale_data_served)::bigint AS stale_data_served,
         COUNT(*)::bigint AS events
       FROM bucketed
       GROUP BY bucket_start
       ORDER BY bucket_start DESC
       LIMIT $5`,
      [bucketMinutes, from.toISOString(), to.toISOString(), authorityScopeIds, limit]
    );

    const sourceResult = await query(
      `WITH filtered AS (
         SELECT ae.created_at, ae.payload_jsonb
         FROM audit_event ae
         WHERE ae.event_type = 'CLIENT_CACHE_TELEMETRY'
           AND ae.created_at >= $2::timestamptz
           AND ae.created_at <= $3::timestamptz
           AND (
             $4::text[] IS NULL OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(COALESCE(ae.payload_jsonb->'authorityScope', '[]'::jsonb)) scope(value)
               WHERE scope.value = ANY($4)
             )
           )
       ),
       bucketed AS (
         SELECT
           to_timestamp(
             floor(extract(epoch FROM created_at) / ($1::int * 60)) * ($1::int * 60)
           ) AS bucket_start,
           payload_jsonb
         FROM filtered
       )
       SELECT
         bucket_start,
         regexp_replace(src.key, '^[^:]+:', '') AS source,
         SUM((src.value)::bigint)::bigint AS total
       FROM bucketed
       CROSS JOIN LATERAL jsonb_each_text(COALESCE(bucketed.payload_jsonb->'sourceDelta', '{}'::jsonb)) src
       GROUP BY bucket_start, source
       ORDER BY bucket_start DESC, total DESC`,
      [bucketMinutes, from.toISOString(), to.toISOString(), authorityScopeIds]
    );

    const sourcesByBucket = new Map<string, Array<{ source: string; total: number }>>();
    for (const row of sourceResult.rows as Array<{ bucket_start: string; source: string; total: string | number }>) {
      const bucketKey = new Date(row.bucket_start).toISOString();
      const list = sourcesByBucket.get(bucketKey) || [];
      list.push({
        source: row.source || "unknown",
        total: Number(row.total || 0),
      });
      sourcesByBucket.set(bucketKey, list);
    }

    const buckets = (bucketResult.rows as Array<{
      bucket_start: string;
      cache_fallback_offline: string | number;
      cache_fallback_error: string | number;
      stale_data_served: string | number;
      events: string | number;
    }>).map((row) => {
      const bucketStart = new Date(row.bucket_start).toISOString();
      const counters = {
        cacheFallbackOffline: Number(row.cache_fallback_offline || 0),
        cacheFallbackError: Number(row.cache_fallback_error || 0),
        staleDataServed: Number(row.stale_data_served || 0),
      };
      const sources = (sourcesByBucket.get(bucketStart) || [])
        .sort((a, b) => b.total - a.total)
        .slice(0, sourceLimit);
      return {
        bucketStart,
        events: Number(row.events || 0),
        counters,
        sources,
      };
    });

    const totals = buckets.reduce(
      (acc, bucket) => {
        acc.events += bucket.events;
        acc.cacheFallbackOffline += bucket.counters.cacheFallbackOffline;
        acc.cacheFallbackError += bucket.counters.cacheFallbackError;
        acc.staleDataServed += bucket.counters.staleDataServed;
        return acc;
      },
      {
        events: 0,
        cacheFallbackOffline: 0,
        cacheFallbackError: 0,
        staleDataServed: 0,
      }
    );

    return {
      scope: {
        authorityId: scopedAuthorityId || null,
        from: from.toISOString(),
        to: to.toISOString(),
        bucketMinutes,
        limit,
        sourceLimit,
      },
      totals,
      buckets,
    };
  });
}
