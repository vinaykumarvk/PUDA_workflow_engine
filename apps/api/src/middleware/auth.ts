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

/** Routes that do NOT require authentication */
export const PUBLIC_ROUTES = [
  "/health",
  "/ready",
  "/metrics",
  "/docs",
  "/api/v1/openapi.json",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/aadhar/send-otp",
  "/api/v1/auth/aadhar/verify-otp",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/payments/callback",
];

const PUBLIC_ROUTE_PREFIXES = [
  "/docs/",
  "/api/v1/config/",
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

/** Register the auth middleware on a Fastify instance */
export function registerAuthMiddleware(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    const url = request.url.split("?")[0];
    if (isPublicRoutePath(url)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401).send({ error: "AUTHENTICATION_REQUIRED", message: "Missing or invalid Authorization header", statusCode: 401 });
      return;
    }

    const token = authHeader.slice(7);
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

    // For officers, also load their postings/roles
    if (payload.userType === "OFFICER") {
      try {
        const postings = await getUserPostings(payload.userId);
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
