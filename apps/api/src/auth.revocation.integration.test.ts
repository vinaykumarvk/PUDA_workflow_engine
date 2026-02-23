import path from "path";
import dotenv from "dotenv";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { query } from "./db";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
process.env.RATE_LIMIT_MAX = "10000";

const TEST_ADMIN_USER_ID = "test-admin-revocation";
const TEST_ADMIN_LOGIN = "admin-revocation";
const TEST_ADMIN_PASSWORD = "password123";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("JWT revocation integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dbReady = false;
  let adminToken = "";

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function login(loginId: string, password: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: loginId, password },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { token?: string };
    expect(typeof body.token).toBe("string");
    return body.token as string;
  }

  async function ensureAdminUser(): Promise<void> {
    await query(
      `INSERT INTO "user" (user_id, login, password_hash, name, email, user_type, profile_jsonb)
       SELECT $1, $2, password_hash, $3, $4, $5, '{}'::jsonb
       FROM "user"
       WHERE user_id = $6
       ON CONFLICT (user_id) DO UPDATE
         SET login = EXCLUDED.login,
             password_hash = EXCLUDED.password_hash,
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             user_type = EXCLUDED.user_type`,
      [
        TEST_ADMIN_USER_ID,
        TEST_ADMIN_LOGIN,
        "Revocation Admin",
        "admin.revocation@test.puda.gov.in",
        "ADMIN",
        "test-officer-1",
      ]
    );
  }

  beforeAll(async () => {
    app = await buildApp(false);
    try {
      await ensureAdminUser();
      adminToken = await login(TEST_ADMIN_LOGIN, TEST_ADMIN_PASSWORD);
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[JWT-REVOCATION-IT] Skipping DB-backed revocation tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) {
      ctx.skip();
    }
  });

  it("revokes current token on /api/v1/auth/logout", async () => {
    const citizenToken = await login("citizen1", "password123");

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: authHeader(citizenToken),
      payload: { reason: "integration-test-logout" },
    });
    expect(logoutRes.statusCode).toBe(200);

    const profileRes = await app.inject({
      method: "GET",
      url: "/api/v1/profile/me",
      headers: authHeader(citizenToken),
    });
    expect(profileRes.statusCode).toBe(401);
    expect(JSON.parse(profileRes.payload).error).toBe("TOKEN_REVOKED");
  });

  it("revokes all active user sessions on /api/v1/auth/logout-all", async () => {
    const tokenA = await login("citizen1", "password123");
    await sleep(1000);
    const tokenB = await login("citizen1", "password123");

    const logoutAllRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout-all",
      headers: authHeader(tokenB),
      payload: { reason: "integration-test-logout-all" },
    });
    expect(logoutAllRes.statusCode).toBe(200);

    const profileA = await app.inject({
      method: "GET",
      url: "/api/v1/profile/me",
      headers: authHeader(tokenA),
    });
    expect(profileA.statusCode).toBe(401);
    expect(JSON.parse(profileA.payload).error).toBe("TOKEN_REVOKED");

    const profileB = await app.inject({
      method: "GET",
      url: "/api/v1/profile/me",
      headers: authHeader(tokenB),
    });
    expect(profileB.statusCode).toBe(401);
    expect(JSON.parse(profileB.payload).error).toBe("TOKEN_REVOKED");

    await sleep(1000);
    const freshToken = await login("citizen1", "password123");
    const freshProfile = await app.inject({
      method: "GET",
      url: "/api/v1/profile/me",
      headers: authHeader(freshToken),
    });
    expect(freshProfile.statusCode).toBe(200);
  });

  it("allows admin to force logout a user", async () => {
    const citizenToken = await login("citizen2", "password123");

    const forceLogoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users/test-citizen-2/force-logout",
      headers: authHeader(adminToken),
      payload: { reason: "security-incident" },
    });
    expect(forceLogoutRes.statusCode).toBe(200);
    const forceBody = JSON.parse(forceLogoutRes.payload) as { success?: boolean };
    expect(forceBody.success).toBe(true);

    const profileRes = await app.inject({
      method: "GET",
      url: "/api/v1/profile/me",
      headers: authHeader(citizenToken),
    });
    expect(profileRes.statusCode).toBe(401);
    expect(JSON.parse(profileRes.payload).error).toBe("TOKEN_REVOKED");
  });
});
