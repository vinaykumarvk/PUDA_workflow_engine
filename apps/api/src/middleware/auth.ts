/**
 * JWT Authentication Middleware for Fastify
 * 
 * Provides token generation, verification, and route protection.
 * Public routes (health, auth endpoints) are whitelisted.
 */
import { randomUUID } from "node:crypto";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt, { JwtPayload } from "jsonwebtoken";
import { getUserPostings, User, UserPosting } from "../auth";
import { checkTokenRevocation } from "../token-security";
import { isTestRuntime } from "../runtime-safety";

// H2: Fail explicitly if JWT_SECRET is not set in production
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && !isTestRuntime()) {
    throw new Error("FATAL: JWT_SECRET environment variable must be set in non-test runtime");
  }
  return secret || "puda-dev-secret-DO-NOT-USE-IN-PRODUCTION";
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "24h";

/** Routes available only outside production (API docs, metrics, OpenAPI spec) */
const DEV_ONLY_ROUTES = ["/metrics", "/docs", "/api/v1/openapi.json"];
const DEV_ONLY_PREFIXES = ["/docs/"];

/** Routes that do NOT require authentication */
export const PUBLIC_ROUTES = [
  "/health",
  "/ready",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/aadhar/send-otp",
  "/api/v1/auth/aadhar/verify-otp",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/payments/callback",
  ...(process.env.NODE_ENV !== "production" ? DEV_ONLY_ROUTES : []),
];

const PUBLIC_ROUTE_PREFIXES = [
  "/api/v1/config/",
  "/internal/jobs/",  // ARC-016: auth handled by X-Internal-Secret header
  ...(process.env.NODE_ENV !== "production" ? DEV_ONLY_PREFIXES : []),
];

export function isPublicRoutePath(url: string): boolean {
  if (PUBLIC_ROUTES.some((route) => url === route)) {
    return true;
  }
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export interface AuthPayload {
  userId: string;
  userType: "CITIZEN" | "OFFICER" | "ADMIN";
  login: string;
  jti: string;
  iat?: number;
  exp?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthPayload & { postings?: UserPosting[] };
    authToken?: string;
  }
}

/** Generate a JWT token for a user */
export function generateToken(user: User): string {
  const payload: AuthPayload = {
    userId: user.user_id,
    userType: user.user_type,
    login: user.login,
    jti: randomUUID(),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

function parseAuthPayload(tokenPayload: string | JwtPayload): AuthPayload | null {
  if (!tokenPayload || typeof tokenPayload !== "object") return null;
  const userId = tokenPayload.userId;
  const userType = tokenPayload.userType;
  const login = tokenPayload.login;
  const jti = tokenPayload.jti;
  if (
    typeof userId !== "string" ||
    typeof login !== "string" ||
    typeof jti !== "string" ||
    (userType !== "CITIZEN" && userType !== "OFFICER" && userType !== "ADMIN")
  ) {
    return null;
  }
  return {
    userId,
    userType,
    login,
    jti,
    iat: typeof tokenPayload.iat === "number" ? tokenPayload.iat : undefined,
    exp: typeof tokenPayload.exp === "number" ? tokenPayload.exp : undefined,
  };
}

/** Verify a JWT token and return the payload */
export function verifyToken(token: string): AuthPayload | null {
  try {
    const tokenPayload = jwt.verify(token, JWT_SECRET) as string | JwtPayload;
    return parseAuthPayload(tokenPayload);
  } catch {
    return null;
  }
}

// PERF-012: Short-TTL in-memory cache for officer postings to reduce DB QPS
const POSTINGS_CACHE_TTL_MS = 30_000; // 30 seconds
const postingsCache = new Map<string, { data: UserPosting[]; expiresAt: number }>();

/** Invalidate cached postings for a user (call when postings change). */
export function invalidatePostingsCache(userId: string): void {
  postingsCache.delete(userId);
}

async function getCachedPostings(userId: string): Promise<UserPosting[]> {
  const now = Date.now();
  const cached = postingsCache.get(userId);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }
  const postings = await getUserPostings(userId);
  postingsCache.set(userId, { data: postings, expiresAt: now + POSTINGS_CACHE_TTL_MS });
  return postings;
}

/** Register the auth middleware on a Fastify instance */
export function registerAuthMiddleware(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    const url = request.url.split("?")[0];
    if (isPublicRoutePath(url)) {
      return;
    }

    // M3: Read token from HttpOnly cookie first, fall back to Authorization header
    const cookieToken = (request.cookies as Record<string, string> | undefined)?.puda_auth;
    const authHeader = request.headers.authorization;
    const token = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
    if (!token) {
      reply.code(401).send({ error: "AUTHENTICATION_REQUIRED", message: "Missing or invalid authentication", statusCode: 401 });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      reply.code(401).send({ error: "INVALID_TOKEN", message: "Token is invalid or expired", statusCode: 401 });
      return;
    }

    try {
      const revocationCheck = await checkTokenRevocation(payload);
      if (revocationCheck.revoked) {
        reply.code(401).send({
          error: "TOKEN_REVOKED",
          message: "Token has been revoked. Please login again.",
          statusCode: 401,
        });
        return;
      }
    } catch {
      reply.code(503).send({
        error: "AUTH_CHECK_FAILED",
        message: "Unable to verify token state at this time",
        statusCode: 503,
      });
      return;
    }

    // Attach user info to request
    request.authUser = payload;
    request.authToken = token;

    // For officers, also load their postings/roles (PERF-012: cached)
    if (payload.userType === "OFFICER") {
      try {
        const postings = await getCachedPostings(payload.userId);
        request.authUser.postings = postings;
      } catch {
        reply.code(503).send({
          error: "OFFICER_POSTINGS_UNAVAILABLE",
          message: "Unable to load officer authority postings",
          statusCode: 503,
        });
        return;
      }
    }
  });
}
