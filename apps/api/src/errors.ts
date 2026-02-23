/**
 * L8: Standardized API error responses.
 */
import { FastifyReply } from "fastify";

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export function sendError(reply: FastifyReply, statusCode: number, error: string, message?: string): ApiError {
  const body: ApiError = { error, message: message || error, statusCode };
  reply.code(statusCode);
  return body;
}

export function send400(reply: FastifyReply, error: string, message?: string) {
  return sendError(reply, 400, error, message);
}
export function send401(reply: FastifyReply, error: string, message?: string) {
  return sendError(reply, 401, error, message);
}
export function send403(reply: FastifyReply, error: string, message?: string) {
  return sendError(reply, 403, error, message);
}
export function send404(reply: FastifyReply, error: string, message?: string) {
  return sendError(reply, 404, error, message);
}

/**
 * Extract authenticated userId from the request.
 */
export function getAuthUserId(request: any, _deprecatedFallbackField?: string): string | null {
  return request.authUser?.userId || null;
}

/**
 * Extract authenticated userType from the request.
 */
export function getAuthUserType(request: any): string | null {
  return request.authUser?.userType || null;
}
