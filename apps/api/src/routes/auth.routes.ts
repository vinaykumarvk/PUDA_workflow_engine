import { randomUUID } from "node:crypto";
import { FastifyInstance, FastifyReply } from "fastify";
import * as auth from "../auth";
import { generateToken } from "../middleware/auth";
import { query } from "../db";
import { send400, send401, send403 } from "../errors";
import { revokeAllUserTokens, revokeToken } from "../token-security";
import { issueMfaChallenge, MFA_PURPOSE_TASK_DECISION } from "../mfa-stepup";
import { validateOfficerCanActOnTask } from "../tasks";

/** M3: Set HttpOnly auth cookie on the reply */
function setAuthCookie(reply: FastifyReply, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  reply.setCookie("puda_auth", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    maxAge: 86400, // 24 hours (seconds)
  });
}

/** M3: Clear auth cookie on the reply */
function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie("puda_auth", { path: "/" });
}

const loginSchema = {
  body: {
    type: "object",
    required: ["login", "password"],
    additionalProperties: false,
    properties: {
      login: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 1 },
    },
  },
};

const registerSchema = {
  body: {
    type: "object",
    required: ["login", "password", "name", "user_type"],
    additionalProperties: false,
    properties: {
      login: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 6 },
      name: { type: "string", minLength: 1 },
      email: { type: "string" },
      phone: { type: "string" },
      // Public self-registration is restricted to CITIZEN accounts.
      user_type: { type: "string", enum: ["CITIZEN"] },
    },
  },
};

const aadharSendOtpSchema = {
  body: {
    type: "object",
    required: ["aadhar"],
    additionalProperties: false,
    properties: {
      aadhar: { type: "string", minLength: 1 },
    },
  },
};

const aadharVerifyOtpSchema = {
  body: {
    type: "object",
    required: ["aadhar", "otp"],
    additionalProperties: false,
    properties: {
      aadhar: { type: "string", minLength: 1 },
      otp: { type: "string", minLength: 1 },
    },
  },
};

const forgotPasswordSchema = {
  body: {
    type: "object",
    required: ["login"],
    additionalProperties: false,
    properties: {
      login: { type: "string", minLength: 1 },
    },
  },
};

const resetPasswordSchema = {
  body: {
    type: "object",
    required: ["token", "newPassword"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 1 },
      newPassword: { type: "string", minLength: 6 },
    },
  },
};

const authMePostingsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: {
        type: "string",
        minLength: 1,
        description: "Deprecated. Ignored; postings are always resolved from the authenticated user.",
      },
    },
  },
};

const logoutSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", minLength: 1 },
    },
  },
};

const logoutAllSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", minLength: 1 },
    },
  },
};

const mfaChallengeSchema = {
  body: {
    type: "object",
    required: ["purpose"],
    additionalProperties: false,
    properties: {
      purpose: { type: "string", enum: [MFA_PURPOSE_TASK_DECISION] },
      taskId: { type: "string", minLength: 1 },
    },
  },
};

async function createAuthAuditEvent(input: {
  eventType: string;
  actorType: string;
  actorId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb)
     VALUES ($1, NULL, $2, $3, $4, $5)`,
    [randomUUID(), input.eventType, input.actorType, input.actorId, JSON.stringify(input.payload)]
  );
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", { schema: loginSchema, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = request.body as { login: string; password: string };
    const user = await auth.authenticate(body.login, body.password);
    if (!user) {
      reply.code(401);
      return { error: "INVALID_CREDENTIALS" };
    }
    const token = generateToken(user);
    setAuthCookie(reply, token);
    return { user, token };
  });

  app.post("/api/v1/auth/register", { schema: registerSchema }, async (request, reply) => {
    const body = request.body as {
      login: string; password: string; name: string;
      email?: string; phone?: string;
      user_type: "CITIZEN";
    };
    if (body.user_type !== "CITIZEN") {
      reply.code(403);
      return { error: "FORBIDDEN", message: "Public registration is allowed only for CITIZEN users", statusCode: 403 };
    }
    try {
      const user = await auth.createUser(body);
      return { user };
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post(
    "/api/v1/auth/aadhar/send-otp",
    { schema: aadharSendOtpSchema, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const body = request.body as { aadhar: string };
    const result = await auth.sendAadharOTP(body.aadhar);
    if (!result.success) reply.code(400);
    return result;
    }
  );

  app.post(
    "/api/v1/auth/aadhar/verify-otp",
    { schema: aadharVerifyOtpSchema, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const body = request.body as { aadhar: string; otp: string };
    const user = await auth.verifyAadharOTP(body.aadhar, body.otp);
    if (!user) {
      reply.code(401);
      return { error: "INVALID_OTP" };
    }
    const token = generateToken(user);
    setAuthCookie(reply, token);
    return { user, token };
    }
  );

  app.post(
    "/api/v1/auth/forgot-password",
    { schema: forgotPasswordSchema, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const body = request.body as { login: string };
    return auth.requestPasswordReset(body.login);
    }
  );

  app.post("/api/v1/auth/reset-password", { schema: resetPasswordSchema }, async (request, reply) => {
    const body = request.body as { token: string; newPassword: string };
    const result = await auth.resetPassword(body.token, body.newPassword);
    if (!result.success) reply.code(400);
    return result;
  });

  app.get("/api/v1/auth/me/postings", { schema: authMePostingsSchema }, async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(400);
      return { error: "USER_ID_REQUIRED", message: "User ID required", statusCode: 400 };
    }
    return { postings: await auth.getUserPostings(userId) };
  });

  app.post("/api/v1/auth/logout", { schema: logoutSchema }, async (request, reply) => {
    if (!request.authUser) {
      return send401(reply, "AUTHENTICATION_REQUIRED", "Login required");
    }
    const body = (request.body || {}) as { reason?: string };
    await revokeToken({
      userId: request.authUser.userId,
      jti: request.authUser.jti,
      exp: request.authUser.exp,
      reason: body.reason || "USER_LOGOUT",
      revokedByUserId: request.authUser.userId,
      metadata: {
        route: "/api/v1/auth/logout",
      },
    });
    await createAuthAuditEvent({
      eventType: "AUTH_TOKEN_REVOKED",
      actorType: request.authUser.userType,
      actorId: request.authUser.userId,
      payload: {
        reason: body.reason || "USER_LOGOUT",
        jti: request.authUser.jti,
      },
    });
    clearAuthCookie(reply);
    return { success: true };
  });

  app.post("/api/v1/auth/logout-all", { schema: logoutAllSchema }, async (request, reply) => {
    if (!request.authUser) {
      return send401(reply, "AUTHENTICATION_REQUIRED", "Login required");
    }
    const body = (request.body || {}) as { reason?: string };
    const revokeReason = body.reason || "USER_LOGOUT_ALL";
    const revokeResult = await revokeAllUserTokens({
      userId: request.authUser.userId,
      reason: revokeReason,
      updatedByUserId: request.authUser.userId,
    });
    await revokeToken({
      userId: request.authUser.userId,
      jti: request.authUser.jti,
      exp: request.authUser.exp,
      reason: "USER_LOGOUT_ALL_CURRENT_TOKEN",
      revokedByUserId: request.authUser.userId,
      metadata: {
        route: "/api/v1/auth/logout-all",
      },
    });
    await createAuthAuditEvent({
      eventType: "AUTH_USER_REVOKE_BEFORE_SET",
      actorType: request.authUser.userType,
      actorId: request.authUser.userId,
      payload: {
        reason: revokeReason,
        revokedBefore: revokeResult.revokedBefore.toISOString(),
      },
    });
    clearAuthCookie(reply);
    return {
      success: true,
      revokedBefore: revokeResult.revokedBefore.toISOString(),
    };
  });

  // M3: Session check endpoint — returns current user from HttpOnly cookie
  app.get("/api/v1/auth/me", async (request, reply) => {
    if (!request.authUser) {
      return send401(reply, "AUTHENTICATION_REQUIRED", "Login required");
    }
    const userResult = await query(
      `SELECT user_id, login, name, email, phone, user_type FROM "user" WHERE user_id = $1`,
      [request.authUser.userId]
    );
    if (!userResult.rows[0]) {
      return send401(reply, "USER_NOT_FOUND", "User no longer exists");
    }
    return { user: userResult.rows[0] };
  });

  app.post(
    "/api/v1/auth/mfa/challenge",
    { schema: mfaChallengeSchema, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!request.authUser) {
        return send401(reply, "AUTHENTICATION_REQUIRED", "Login required");
      }
      if (request.authUser.userType === "CITIZEN") {
        return send403(reply, "FORBIDDEN", "MFA challenge is only available for officer/admin users");
      }
      const body = request.body as {
        purpose: typeof MFA_PURPOSE_TASK_DECISION;
        taskId?: string;
      };
      if (body.purpose === MFA_PURPOSE_TASK_DECISION && !body.taskId) {
        return send400(reply, "TASK_ID_REQUIRED", "taskId is required for task decision MFA");
      }
      if (body.taskId && request.authUser.userType === "OFFICER") {
        const canAct = await validateOfficerCanActOnTask(request.authUser.userId, body.taskId);
        if (!canAct.authorized) {
          return send403(
            reply,
            "FORBIDDEN",
            "You are not allowed to request MFA challenge for this task"
          );
        }
      }

      const challenge = await issueMfaChallenge({
        userId: request.authUser.userId,
        purpose: body.purpose,
        taskId: body.taskId,
        metadata: {
          actorType: request.authUser.userType,
          route: "/api/v1/auth/mfa/challenge",
        },
      });

      await createAuthAuditEvent({
        eventType: "AUTH_MFA_CHALLENGE_ISSUED",
        actorType: request.authUser.userType,
        actorId: request.authUser.userId,
        payload: {
          purpose: body.purpose,
          taskId: body.taskId || null,
          challengeId: challenge.challengeId,
          deliveryChannels: challenge.deliveryChannels,
        },
      });

      return challenge;
    }
  );
}
