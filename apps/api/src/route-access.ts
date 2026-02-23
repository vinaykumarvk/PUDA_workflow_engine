import { FastifyReply, FastifyRequest } from "fastify";
import {
  AccessResult,
  AuthorityAccessResult,
  authorizeApplicationRead,
  authorizeApplicationStaffMutation,
  authorizeAuthorityStaffAccess,
  authorizeCitizenOwnedApplication,
} from "./policy";
import { send400, send401, send403, send404 } from "./errors";
import { query } from "./db";

export function sendApplicationAccessDenied(
  reply: FastifyReply,
  access: AccessResult,
  forbiddenMessage: string
) {
  if (access.reason === "APPLICATION_NOT_FOUND") {
    return reply.send(send404(reply, "APPLICATION_NOT_FOUND"));
  }
  if (access.reason === "AUTHENTICATION_REQUIRED") {
    return reply.send(send401(reply, "AUTHENTICATION_REQUIRED"));
  }
  return reply.send(send403(reply, "FORBIDDEN", forbiddenMessage));
}

export function sendAuthorityAccessDenied(
  reply: FastifyReply,
  access: AuthorityAccessResult,
  forbiddenMessage: string
) {
  if (access.reason === "AUTHENTICATION_REQUIRED") {
    return reply.send(send401(reply, "AUTHENTICATION_REQUIRED"));
  }
  return reply.send(send403(reply, "FORBIDDEN", forbiddenMessage));
}

export async function requireApplicationReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  arnOrPublic: string,
  forbiddenMessage: string
): Promise<string | null> {
  const access = await authorizeApplicationRead(request, arnOrPublic);
  if (!access.authorized || !access.application) {
    sendApplicationAccessDenied(reply, access, forbiddenMessage);
    return null;
  }
  return access.application.arn;
}

export async function requireApplicationStaffMutationAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  arnOrPublic: string,
  forbiddenMessage: string
): Promise<string | null> {
  const access = await authorizeApplicationStaffMutation(request, arnOrPublic);
  if (!access.authorized || !access.application) {
    sendApplicationAccessDenied(reply, access, forbiddenMessage);
    return null;
  }
  return access.application.arn;
}

export async function requireCitizenOwnedApplicationAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  arnOrPublic: string,
  forbiddenMessage: string
): Promise<string | null> {
  const access = await authorizeCitizenOwnedApplication(request, arnOrPublic);
  if (!access.authorized || !access.application) {
    sendApplicationAccessDenied(reply, access, forbiddenMessage);
    return null;
  }
  return access.application.arn;
}

export function requireAuthorityStaffAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  authorityId: string,
  forbiddenMessage: string
): boolean {
  const access = authorizeAuthorityStaffAccess(request, authorityId);
  if (!access.authorized) {
    sendAuthorityAccessDenied(reply, access, forbiddenMessage);
    return false;
  }
  return true;
}

export async function requireValidAuthorityId(
  reply: FastifyReply,
  authorityId: string | undefined
): Promise<boolean> {
  if (!authorityId) return true;
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(authorityId)) {
    reply.send(
      send400(
        reply,
        "INVALID_AUTHORITY_ID",
        "authorityId must match pattern ^[A-Z][A-Z0-9_]{1,31}$"
      )
    );
    return false;
  }
  const authority = await query(
    `SELECT 1 FROM authority WHERE authority_id = $1 LIMIT 1`,
    [authorityId]
  );
  if (authority.rows.length > 0) return true;
  reply.send(send400(reply, "INVALID_AUTHORITY_ID", "Unknown authorityId"));
  return false;
}
