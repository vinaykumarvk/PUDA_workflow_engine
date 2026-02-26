/**
 * Admin sub-module: user & authority management routes.
 * Split from admin.routes.ts — shares hooks/helpers via the barrel.
 */
import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { query } from "../db";
import { send400, send403 } from "../errors";
import {
  requireAuthorityStaffAccess,
  requireValidAuthorityId,
} from "../route-access";
import { revokeAllUserTokens } from "../token-security";
import { resolveOfficerAuthorityScope } from "./admin.routes";

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

export async function registerAdminUserRoutes(app: FastifyInstance) {
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
