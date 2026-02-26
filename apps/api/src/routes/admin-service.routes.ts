/**
 * Admin sub-module: service config CRUD (holidays, feature flags).
 * Split from admin.routes.ts — shares hooks/helpers via the barrel.
 */
import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { query } from "../db";
import { send400, send403 } from "../errors";
import { requireValidAuthorityId } from "../route-access";
import { invalidateFeatureFlagCache } from "../feature-flags";
import { resolveOfficerAuthorityScope } from "./admin.routes";

const createHolidaySchema = {
  body: {
    type: "object",
    required: ["holidayDate", "description"],
    additionalProperties: false,
    properties: {
      authorityId: { type: "string" },
      holidayDate: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      description: { type: "string", minLength: 1 },
    },
  },
};

const deleteHolidaySchema = {
  body: {
    type: "object",
    required: ["holidayDate"],
    additionalProperties: false,
    properties: {
      authorityId: { type: "string" },
      holidayDate: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
  },
};

const holidaysReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      year: { type: "string", pattern: "^\\d{4}$" },
    },
  },
};

const featureFlagsReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      flagKey: { type: "string", minLength: 1 },
    },
  },
};

const featureFlagUpdateSchema = {
  params: {
    type: "object",
    required: ["flagKey"],
    additionalProperties: false,
    properties: {
      flagKey: { type: "string", minLength: 1 },
    },
  },
  body: {
    type: "object",
    required: ["enabled"],
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      rolloutPercentage: { type: "integer", minimum: 0, maximum: 100 },
      description: { type: "string" },
      authorityIds: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      userIds: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      userTypes: {
        type: "array",
        items: { type: "string", enum: ["CITIZEN", "OFFICER", "ADMIN"] },
      },
      systemRoles: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      activeFrom: { type: "string", format: "date-time" },
      activeTo: { type: "string", format: "date-time" },
    },
  },
};

function isValidFeatureFlagKey(flagKey: string): boolean {
  return /^[a-z][a-z0-9_:-]{1,63}$/.test(flagKey);
}

function uniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export async function registerAdminServiceRoutes(app: FastifyInstance) {
  // --- Holiday Calendar Management ---
  app.get("/api/v1/admin/holidays", { schema: holidaysReadSchema }, async (request, reply) => {
    const authorityId = (request.query as any).authorityId;
    const scopedAuthorityId = resolveOfficerAuthorityScope(
      request,
      reply,
      authorityId,
      "view holidays"
    );
    if (scopedAuthorityId === null) return;
    if (request.authUser?.userType === "ADMIN" && scopedAuthorityId) {
      const authorityExists = await requireValidAuthorityId(reply, scopedAuthorityId);
      if (!authorityExists) return;
    }
    const year = parseInt((request.query as any).year || `${new Date().getFullYear()}`, 10);
    const result = await query(
      `SELECT authority_id, holiday_date, description FROM authority_holiday
       WHERE ($1::text IS NULL OR authority_id = $1)
         AND EXTRACT(YEAR FROM holiday_date) = $2
       ORDER BY holiday_date`,
      [scopedAuthorityId || null, year]
    );
    return { holidays: result.rows };
  });

  app.post("/api/v1/admin/holidays", { schema: createHolidaySchema }, async (request, reply) => {
    const body = request.body as { authorityId: string; holidayDate: string; description: string };
    if (!body?.authorityId) {
      return reply.send(
        send400(reply, "AUTHORITY_ID_REQUIRED", "authorityId is required")
      );
    }
    const validAuthority = await requireValidAuthorityId(reply, body.authorityId);
    if (!validAuthority) return;
    await query(
      `INSERT INTO authority_holiday (authority_id, holiday_date, description)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [body.authorityId, body.holidayDate, body.description]
    );
    return { success: true };
  });

  app.delete("/api/v1/admin/holidays", { schema: deleteHolidaySchema }, async (request, reply) => {
    const body = request.body as { authorityId: string; holidayDate: string };
    if (!body?.authorityId) {
      return reply.send(
        send400(reply, "AUTHORITY_ID_REQUIRED", "authorityId is required")
      );
    }
    const validAuthority = await requireValidAuthorityId(reply, body.authorityId);
    if (!validAuthority) return;
    await query(
      `DELETE FROM authority_holiday WHERE authority_id = $1 AND holiday_date = $2`,
      [body.authorityId, body.holidayDate]
    );
    return { success: true };
  });

  // --- Feature Flags ---
  app.get("/api/v1/admin/feature-flags", { schema: featureFlagsReadSchema }, async (request, reply) => {
    if (request.authUser?.userType !== "ADMIN") {
      return reply.send(
        send403(reply, "ADMIN_ACCESS_REQUIRED", "Only ADMIN users can view feature flags")
      );
    }
    const queryParams = request.query as { flagKey?: string };
    if (queryParams.flagKey && !isValidFeatureFlagKey(queryParams.flagKey)) {
      return reply.send(
        send400(
          reply,
          "INVALID_FLAG_KEY",
          "flagKey must match pattern ^[a-z][a-z0-9_:-]{1,63}$"
        )
      );
    }
    const result = queryParams.flagKey
      ? await query(
        `SELECT flag_key, enabled, rollout_percentage, description, rules_jsonb, updated_at, updated_by_user_id
         FROM feature_flag
         WHERE flag_key = $1`,
        [queryParams.flagKey]
      )
      : await query(
        `SELECT flag_key, enabled, rollout_percentage, description, rules_jsonb, updated_at, updated_by_user_id
         FROM feature_flag
         ORDER BY flag_key ASC`
      );
    const flags = result.rows.map((row) => ({
      flagKey: row.flag_key,
      enabled: row.enabled,
      rolloutPercentage: Number(row.rollout_percentage),
      description: row.description,
      rules: row.rules_jsonb || {},
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id,
    }));
    return { flags };
  });

  app.put("/api/v1/admin/feature-flags/:flagKey", { schema: featureFlagUpdateSchema }, async (request, reply) => {
    if (request.authUser?.userType !== "ADMIN") {
      return reply.send(
        send403(reply, "ADMIN_ACCESS_REQUIRED", "Only ADMIN users can update feature flags")
      );
    }
    const params = request.params as { flagKey: string };
    const body = request.body as {
      enabled: boolean;
      rolloutPercentage?: number;
      description?: string;
      authorityIds?: string[];
      userIds?: string[];
      userTypes?: Array<"CITIZEN" | "OFFICER" | "ADMIN">;
      systemRoles?: string[];
      activeFrom?: string;
      activeTo?: string;
    };
    if (!isValidFeatureFlagKey(params.flagKey)) {
      return reply.send(
        send400(
          reply,
          "INVALID_FLAG_KEY",
          "flagKey must match pattern ^[a-z][a-z0-9_:-]{1,63}$"
        )
      );
    }
    const rolloutPercentage = Number.isInteger(body.rolloutPercentage)
      ? Number(body.rolloutPercentage)
      : 100;
    if (rolloutPercentage < 0 || rolloutPercentage > 100) {
      return reply.send(
        send400(reply, "INVALID_ROLLOUT_PERCENTAGE", "rolloutPercentage must be between 0 and 100")
      );
    }

    const authorityIds = uniqueStringList(body.authorityIds);
    for (const authorityId of authorityIds) {
      const validAuthority = await requireValidAuthorityId(reply, authorityId);
      if (!validAuthority) return;
    }

    const systemRoles = uniqueStringList(body.systemRoles);
    if (systemRoles.length > 0) {
      const roleResult = await query(
        `SELECT system_role_id
         FROM system_role
         WHERE system_role_id = ANY($1::text[])`,
        [systemRoles]
      );
      const knownRoles = new Set(
        roleResult.rows
          .map((row) => row.system_role_id)
          .filter((role): role is string => typeof role === "string")
      );
      const unknownRoles = systemRoles.filter((role) => !knownRoles.has(role));
      if (unknownRoles.length > 0) {
        return reply.send(
          send400(
            reply,
            "INVALID_SYSTEM_ROLE",
            `Unknown systemRoles: ${unknownRoles.join(", ")}`
          )
        );
      }
    }

    const activeFromRaw = body.activeFrom?.trim() ? body.activeFrom.trim() : null;
    const activeToRaw = body.activeTo?.trim() ? body.activeTo.trim() : null;
    const activeFromMs = activeFromRaw ? Date.parse(activeFromRaw) : null;
    const activeToMs = activeToRaw ? Date.parse(activeToRaw) : null;
    if (
      (activeFromMs !== null && !Number.isFinite(activeFromMs)) ||
      (activeToMs !== null && !Number.isFinite(activeToMs))
    ) {
      return reply.send(
        send400(
          reply,
          "INVALID_ACTIVE_WINDOW",
          "activeFrom/activeTo must be valid ISO date-time values"
        )
      );
    }
    if (
      activeFromMs !== null &&
      activeToMs !== null &&
      activeFromMs > activeToMs
    ) {
      return reply.send(
        send400(
          reply,
          "INVALID_ACTIVE_WINDOW",
          "activeFrom must be less than or equal to activeTo"
        )
      );
    }

    const rulesJson = {
      authorityIds,
      userIds: uniqueStringList(body.userIds),
      userTypes: Array.from(new Set(Array.isArray(body.userTypes) ? body.userTypes : [])),
      systemRoles,
      activeFrom: activeFromMs === null ? null : new Date(activeFromMs).toISOString(),
      activeTo: activeToMs === null ? null : new Date(activeToMs).toISOString(),
    };

    const updatedBy = request.authUser.userId;
    const result = await query(
      `INSERT INTO feature_flag
         (flag_key, enabled, rollout_percentage, description, rules_jsonb, updated_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (flag_key) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             rollout_percentage = EXCLUDED.rollout_percentage,
             description = EXCLUDED.description,
             rules_jsonb = EXCLUDED.rules_jsonb,
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = NOW()
       RETURNING flag_key, enabled, rollout_percentage, description, rules_jsonb, updated_at, updated_by_user_id`,
      [
        params.flagKey,
        body.enabled,
        rolloutPercentage,
        body.description || null,
        JSON.stringify(rulesJson),
        updatedBy,
      ]
    );
    invalidateFeatureFlagCache(params.flagKey);

    await query(
      `INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [
        randomUUID(),
        "FEATURE_FLAG_UPDATED",
        request.authUser.userType,
        request.authUser.userId,
        JSON.stringify({
          flagKey: params.flagKey,
          enabled: body.enabled,
          rolloutPercentage,
          rules: rulesJson,
        }),
      ]
    );

    const row = result.rows[0] as {
      flag_key: string;
      enabled: boolean;
      rollout_percentage: number;
      description: string | null;
      rules_jsonb: Record<string, unknown> | null;
      updated_at: Date;
      updated_by_user_id: string | null;
    };
    return {
      flag: {
        flagKey: row.flag_key,
        enabled: row.enabled,
        rolloutPercentage: Number(row.rollout_percentage),
        description: row.description,
        rules: row.rules_jsonb || {},
        updatedAt: row.updated_at,
        updatedByUserId: row.updated_by_user_id,
      },
    };
  });
}
