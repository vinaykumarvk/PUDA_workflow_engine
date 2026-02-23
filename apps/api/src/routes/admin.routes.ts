/**
 * C8: Admin API routes for holiday calendar, user management, and system configuration.
 * L6: Read routes require ADMIN or OFFICER; mutating routes require ADMIN.
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { query } from "../db";
import { send400, send401, send403 } from "../errors";
import {
  requireAuthorityStaffAccess,
  requireValidAuthorityId,
} from "../route-access";
import { invalidateFeatureFlagCache } from "../feature-flags";
import { revokeAllUserTokens } from "../token-security";

function hasStrictObjectBodySchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const body = (schema as { body?: unknown }).body;
  if (!body || typeof body !== "object") return false;
  const bodySchema = body as {
    type?: unknown;
    required?: unknown;
    additionalProperties?: unknown;
  };
  return (
    bodySchema.type === "object" &&
    Array.isArray(bodySchema.required) &&
    bodySchema.required.length > 0 &&
    bodySchema.additionalProperties === false
  );
}

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

const adminUsersReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userType: { type: "string", minLength: 1 },
      authorityId: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    },
  },
};

const adminUserPostingsReadSchema = {
  params: {
    type: "object",
    required: ["userId"],
    additionalProperties: false,
    properties: {
      userId: { type: "string", minLength: 1 },
    },
  },
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
    },
  },
};

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

const forceLogoutSchema = {
  params: {
    type: "object",
    required: ["userId"],
    additionalProperties: false,
    properties: {
      userId: { type: "string", minLength: 1 },
    },
  },
  body: {
    type: "object",
    required: ["reason"],
    additionalProperties: false,
    properties: {
      reason: { type: "string", minLength: 1 },
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

/**
 * Guard: only ADMIN or OFFICER can access admin routes (read-only).
 */
async function requireAdminOrOfficer(request: FastifyRequest, reply: FastifyReply) {
  const userType = request.authUser?.userType;
  if (!userType) {
    return reply.send(send401(reply, "AUTHENTICATION_REQUIRED"));
  }
  if (userType !== "ADMIN" && userType !== "OFFICER") {
    return reply.send(
      send403(reply, "ADMIN_ACCESS_REQUIRED", "Only ADMIN or OFFICER users can access admin endpoints")
    );
  }
}

/**
 * Guard: only ADMIN can perform admin mutations.
 */
async function requireAdminOnly(request: FastifyRequest, reply: FastifyReply) {
  const userType = request.authUser?.userType;
  if (!userType) {
    return reply.send(send401(reply, "AUTHENTICATION_REQUIRED"));
  }
  if (userType !== "ADMIN") {
    return reply.send(
      send403(reply, "ADMIN_ACCESS_REQUIRED", "Only ADMIN users can modify admin resources")
    );
  }
}

function resolveOfficerAuthorityScope(
  request: FastifyRequest,
  reply: FastifyReply,
  requestedAuthorityId: string | undefined,
  actionDescription: string
): string | undefined | null {
  const userType = request.authUser?.userType;
  if (userType === "ADMIN") {
    return requestedAuthorityId;
  }
  if (userType !== "OFFICER") {
    return null;
  }

  if (requestedAuthorityId) {
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      requestedAuthorityId,
      `You are not allowed to ${actionDescription} in this authority`
    );
    if (!allowed) return null;
    return requestedAuthorityId;
  }

  const authorityIds = Array.from(
    new Set(
      (request.authUser?.postings || [])
        .map((posting) => posting.authority_id)
        .filter((authorityId): authorityId is string => Boolean(authorityId))
    )
  );

  if (authorityIds.length === 1) {
    return authorityIds[0];
  }
  if (authorityIds.length === 0) {
    reply.send(
      send403(
        reply,
        "FORBIDDEN",
        `You are not posted to any authority and cannot ${actionDescription}`
      )
    );
    return null;
  }
  reply.send(
    send400(
      reply,
      "AUTHORITY_ID_REQUIRED",
      "authorityId query parameter is required when officer has access to multiple authorities"
    )
  );
  return null;
}

function getOfficerAuthorityIds(request: FastifyRequest): string[] {
  return Array.from(
    new Set(
      (request.authUser?.postings || [])
        .map((posting) => posting.authority_id)
        .filter((authorityId): authorityId is string => Boolean(authorityId))
    )
  );
}

function parsePositiveInteger(rawValue: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // Enforce strict JSON body schema for all admin mutation routes.
  app.addHook("onRoute", (routeOptions) => {
    if (!routeOptions.url.startsWith("/api/v1/admin")) return;
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    const isMutation = methods.some(
      (method) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS"
    );
    if (!isMutation) return;
    if (!hasStrictObjectBodySchema(routeOptions.schema)) {
      throw new Error(
        `[ADMIN_SCHEMA_REQUIRED] ${methods.join(",")} ${routeOptions.url} must define a strict body schema (object + required[] + additionalProperties=false)`
      );
    }
  });

  // L6: Register guards for all admin routes
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/v1/admin")) {
      await requireAdminOrOfficer(request, reply);
      if (reply.sent) return;
      // Mutating admin routes are ADMIN-only.
      if (request.method !== "GET") {
        await requireAdminOnly(request, reply);
      }
    }
  });

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

  // --- User Management ---
  app.get("/api/v1/admin/users", { schema: adminUsersReadSchema }, async (request, reply) => {
    const userTypeFromAuth = request.authUser?.userType;
    const userType = (request.query as any).userType;
    const authorityId = (request.query as any).authorityId;
    const limit = Math.min(parseInt((request.query as any).limit || "50", 10), 200);
    const offset = parseInt((request.query as any).offset || "0", 10);

    if (userTypeFromAuth === "OFFICER") {
      if (userType && userType !== "OFFICER") {
        return reply.send(
          send403(
            reply,
            "FORBIDDEN",
            "Officers can only list officer users in their posted authorities"
          )
        );
      }
      const scopedAuthorityId = resolveOfficerAuthorityScope(
        request,
        reply,
        authorityId,
        "view users"
      );
      if (scopedAuthorityId === null) return;
      const authorityIds = scopedAuthorityId ? [scopedAuthorityId] : [];
      const result = await query(
        `SELECT DISTINCT u.user_id, u.login, u.name, u.email, u.phone, u.user_type, u.created_at
         FROM "user" u
         JOIN user_posting up ON up.user_id = u.user_id
         WHERE u.user_type = 'OFFICER'
           AND up.authority_id = ANY($1)
         ORDER BY u.created_at DESC
         LIMIT $2 OFFSET $3`,
        [authorityIds, limit, offset]
      );
      return { users: result.rows };
    }

    if (userTypeFromAuth === "ADMIN" && authorityId) {
      const authorityExists = await requireValidAuthorityId(reply, authorityId);
      if (!authorityExists) return;
    }

    if (authorityId) {
      const result = await query(
        `SELECT DISTINCT u.user_id, u.login, u.name, u.email, u.phone, u.user_type, u.created_at
         FROM "user" u
         JOIN user_posting up ON up.user_id = u.user_id
         WHERE ($1::text IS NULL OR u.user_type = $1)
           AND up.authority_id = $2
         ORDER BY u.created_at DESC
         LIMIT $3 OFFSET $4`,
        [userType || null, authorityId, limit, offset]
      );
      return { users: result.rows };
    }

    const result = await query(
      `SELECT user_id, login, name, email, phone, user_type, created_at
       FROM "user"
       WHERE ($1::text IS NULL OR user_type = $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userType || null, limit, offset]
    );
    return { users: result.rows };
  });

  app.get("/api/v1/admin/users/:userId/postings", { schema: adminUserPostingsReadSchema }, async (request, reply) => {
    const params = request.params as { userId: string };
    const requestedAuthorityId = (request.query as any).authorityId;
    const scopedAuthorityId = resolveOfficerAuthorityScope(
      request,
      reply,
      requestedAuthorityId,
      "view postings"
    );
    if (scopedAuthorityId === null) return;
    const authorityIds = scopedAuthorityId ? [scopedAuthorityId] : null;
    const result = await query(
      `SELECT up.posting_id, up.authority_id, up.designation_id, d.designation_name,
              up.active_from, up.active_to
       FROM user_posting up
       JOIN designation d ON up.designation_id = d.designation_id
       WHERE up.user_id = $1
         AND ($2::text[] IS NULL OR up.authority_id = ANY($2))
       ORDER BY up.active_from DESC`,
      [params.userId, authorityIds]
    );
    if (
      request.authUser?.userType === "OFFICER" &&
      authorityIds &&
      result.rows.length === 0
    ) {
      const targetHasPostings = await query(
        `SELECT 1 FROM user_posting WHERE user_id = $1 LIMIT 1`,
        [params.userId]
      );
      if (targetHasPostings.rows.length > 0) {
        return reply.send(
          send403(
            reply,
            "FORBIDDEN",
            "You are not allowed to view postings for users outside your authority scope"
          )
        );
      }
    }
    return { postings: result.rows };
  });

  app.post("/api/v1/admin/users/:userId/force-logout", { schema: forceLogoutSchema }, async (request, reply) => {
    const params = request.params as { userId: string };
    const body = request.body as { reason: string };
    const targetUserResult = await query(
      `SELECT user_id, user_type FROM "user" WHERE user_id = $1`,
      [params.userId]
    );
    if (!targetUserResult.rows[0]?.user_id) {
      return reply.send(send400(reply, "USER_NOT_FOUND", "Target user was not found"));
    }

    const actorUserId = request.authUser?.userId || "system";
    const actorUserType = request.authUser?.userType || "SYSTEM";
    const revokeReason = `ADMIN_FORCE_LOGOUT: ${body.reason}`;
    const revokeResult = await revokeAllUserTokens({
      userId: params.userId,
      reason: revokeReason,
      updatedByUserId: actorUserId,
    });

    await query(
      `INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [
        randomUUID(),
        "AUTH_FORCE_LOGOUT",
        actorUserType,
        actorUserId,
        JSON.stringify({
          targetUserId: params.userId,
          reason: body.reason,
          revokedBefore: revokeResult.revokedBefore.toISOString(),
        }),
      ]
    );

    return {
      success: true,
      userId: params.userId,
      revokedBefore: revokeResult.revokedBefore.toISOString(),
    };
  });

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

  // --- Designation Management ---
  app.get("/api/v1/admin/designations", { schema: authorityScopedReadSchema }, async (request, reply) => {
    const authorityId = (request.query as any).authorityId;
    const scopedAuthorityId = resolveOfficerAuthorityScope(
      request,
      reply,
      authorityId,
      "view designations"
    );
    if (scopedAuthorityId === null) return;
    if (request.authUser?.userType === "ADMIN" && scopedAuthorityId) {
      const authorityExists = await requireValidAuthorityId(reply, scopedAuthorityId);
      if (!authorityExists) return;
    }
    const result = await query(
      `SELECT d.designation_id, d.authority_id, d.designation_name,
              array_agg(drm.system_role_id) as system_role_ids
       FROM designation d
       LEFT JOIN designation_role_map drm ON d.designation_id = drm.designation_id AND d.authority_id = drm.authority_id
       WHERE ($1::text IS NULL OR d.authority_id = $1)
       GROUP BY d.designation_id, d.authority_id, d.designation_name
       ORDER BY d.authority_id, d.designation_name`,
      [scopedAuthorityId || null]
    );
    return { designations: result.rows };
  });
}
