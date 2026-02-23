import { FastifyRequest } from "fastify";
import { query } from "./db";

export interface ApplicationAccessContext {
  arn: string;
  public_arn: string | null;
  authority_id: string;
  applicant_user_id: string | null;
}

export type AccessFailureReason =
  | "AUTHENTICATION_REQUIRED"
  | "APPLICATION_NOT_FOUND"
  | "FORBIDDEN";

export interface AccessResult {
  authorized: boolean;
  application?: ApplicationAccessContext;
  reason?: AccessFailureReason;
}

export type AuthorityAccessFailureReason =
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN";

export interface AuthorityAccessResult {
  authorized: boolean;
  reason?: AuthorityAccessFailureReason;
}

async function loadApplicationContext(
  arnOrPublic: string
): Promise<ApplicationAccessContext | null> {
  const result = await query(
    `SELECT arn, public_arn, authority_id, applicant_user_id
     FROM application
     WHERE arn = $1 OR public_arn = $1
     LIMIT 1`,
    [arnOrPublic]
  );
  return result.rows[0] || null;
}

function officerHasAuthorityAccess(
  request: FastifyRequest,
  authorityId: string
): boolean {
  const postings = request.authUser?.postings || [];
  return postings.some((posting) => posting.authority_id === authorityId);
}

function isCitizenOwner(
  request: FastifyRequest,
  applicantUserId: string | null
): boolean {
  if (!applicantUserId) return false;
  return request.authUser?.userType === "CITIZEN" && request.authUser.userId === applicantUserId;
}

/**
 * Read access:
 * - ADMIN: any application
 * - OFFICER: applications in authorities they are posted to
 * - CITIZEN: only their own applications
 */
export async function authorizeApplicationRead(
  request: FastifyRequest,
  arnOrPublic: string
): Promise<AccessResult> {
  const application = await loadApplicationContext(arnOrPublic);
  if (!application) {
    return { authorized: false, reason: "APPLICATION_NOT_FOUND" };
  }

  if (!request.authUser) {
    return { authorized: false, reason: "AUTHENTICATION_REQUIRED" };
  }

  if (request.authUser.userType === "ADMIN") {
    return { authorized: true, application };
  }

  if (
    request.authUser.userType === "OFFICER" &&
    officerHasAuthorityAccess(request, application.authority_id)
  ) {
    return { authorized: true, application };
  }

  if (isCitizenOwner(request, application.applicant_user_id)) {
    return { authorized: true, application };
  }

  return { authorized: false, reason: "FORBIDDEN" };
}

/**
 * Citizen-owned mutation access:
 * - CITIZEN: only their own applications
 */
export async function authorizeCitizenOwnedApplication(
  request: FastifyRequest,
  arnOrPublic: string
): Promise<AccessResult> {
  const application = await loadApplicationContext(arnOrPublic);
  if (!application) {
    return { authorized: false, reason: "APPLICATION_NOT_FOUND" };
  }

  if (!request.authUser) {
    return { authorized: false, reason: "AUTHENTICATION_REQUIRED" };
  }

  if (!isCitizenOwner(request, application.applicant_user_id)) {
    return { authorized: false, reason: "FORBIDDEN" };
  }

  return { authorized: true, application };
}

/**
 * Staff mutation access:
 * - ADMIN: any application
 * - OFFICER: applications in authorities they are posted to
 */
export async function authorizeApplicationStaffMutation(
  request: FastifyRequest,
  arnOrPublic: string
): Promise<AccessResult> {
  const application = await loadApplicationContext(arnOrPublic);
  if (!application) {
    return { authorized: false, reason: "APPLICATION_NOT_FOUND" };
  }

  if (!request.authUser) {
    return { authorized: false, reason: "AUTHENTICATION_REQUIRED" };
  }

  if (request.authUser.userType === "ADMIN") {
    return { authorized: true, application };
  }

  if (
    request.authUser.userType === "OFFICER" &&
    officerHasAuthorityAccess(request, application.authority_id)
  ) {
    return { authorized: true, application };
  }

  return { authorized: false, reason: "FORBIDDEN" };
}

/**
 * Authority-level staff access:
 * - ADMIN: any authority
 * - OFFICER: only authorities they are posted to
 */
export function authorizeAuthorityStaffAccess(
  request: FastifyRequest,
  authorityId: string
): AuthorityAccessResult {
  if (!request.authUser) {
    return { authorized: false, reason: "AUTHENTICATION_REQUIRED" };
  }

  if (request.authUser.userType === "ADMIN") {
    return { authorized: true };
  }

  if (
    request.authUser.userType === "OFFICER" &&
    officerHasAuthorityAccess(request, authorityId)
  ) {
    return { authorized: true };
  }

  return { authorized: false, reason: "FORBIDDEN" };
}
