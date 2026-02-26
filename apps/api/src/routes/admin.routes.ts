/**
 * C8: Admin API routes — barrel file.
 * Registers shared hooks (schema enforcement, admin guard) then delegates
 * to sub-modules for user, service, and report routes.
 *
 * Shared helpers are exported so the sub-modules can import them.
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { send400, send401, send403 } from "../errors";
import {
  requireAuthorityStaffAccess,
} from "../route-access";
import { registerAdminUserRoutes } from "./admin-user.routes";
import { registerAdminServiceRoutes } from "./admin-service.routes";
import { registerAdminReportRoutes } from "./admin-reports.routes";

// ---------------------------------------------------------------------------
// Shared helpers — exported for sub-modules
// ---------------------------------------------------------------------------

export function hasStrictObjectBodySchema(schema: unknown): boolean {
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

/**
 * Guard: only ADMIN or OFFICER can access admin routes (read-only).
 */
export async function requireAdminOrOfficer(request: FastifyRequest, reply: FastifyReply) {
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
export async function requireAdminOnly(request: FastifyRequest, reply: FastifyReply) {
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

export function resolveOfficerAuthorityScope(
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

export function getOfficerAuthorityIds(request: FastifyRequest): string[] {
  return Array.from(
    new Set(
      (request.authUser?.postings || [])
        .map((posting) => posting.authority_id)
        .filter((authorityId): authorityId is string => Boolean(authorityId))
    )
  );
}

export function parsePositiveInteger(rawValue: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// ---------------------------------------------------------------------------
// Barrel registration
// ---------------------------------------------------------------------------

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

  // Delegate to sub-modules
  await registerAdminUserRoutes(app);
  await registerAdminServiceRoutes(app);
  await registerAdminReportRoutes(app);
}
