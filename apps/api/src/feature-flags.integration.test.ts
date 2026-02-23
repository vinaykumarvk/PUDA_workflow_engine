import path from "path";
import dotenv from "dotenv";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { query } from "./db";
import { invalidateFeatureFlagCache, isFeatureEnabled } from "./feature-flags";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
process.env.RATE_LIMIT_MAX = "10000";

describe("Feature flags integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dbReady = false;
  let adminToken = "";
  let officerToken = "";

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function login(loginId: string, password: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: loginId, password },
    });
    if (res.statusCode !== 200) {
      throw new Error(`LOGIN_FAILED_${loginId}_${res.statusCode}`);
    }
    const body = JSON.parse(res.payload) as { token?: string };
    if (!body.token) {
      throw new Error(`LOGIN_TOKEN_MISSING_${loginId}`);
    }
    return body.token;
  }

  async function putFlag(
    token: string,
    flagKey: string,
    payload: Record<string, unknown>
  ): Promise<{ statusCode: number; payload: string }> {
    return app.inject({
      method: "PUT",
      url: `/api/v1/admin/feature-flags/${flagKey}`,
      headers: authHeader(token),
      payload,
    });
  }

  beforeAll(async () => {
    app = await buildApp(false);
    try {
      await query(
        `INSERT INTO "user" (user_id, login, password_hash, name, email, user_type)
         SELECT $1, $2, password_hash, $3, $4, $5
         FROM "user"
         WHERE user_id = $6
         ON CONFLICT (user_id) DO UPDATE
         SET login = EXCLUDED.login,
             password_hash = EXCLUDED.password_hash,
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             user_type = EXCLUDED.user_type`,
        [
          "test-admin-feature-flags",
          "admin-feature-flags",
          "Feature Flags Admin",
          "admin.feature-flags@test.puda.gov.in",
          "ADMIN",
          "test-officer-1",
        ]
      );
      adminToken = await login("admin-feature-flags", "password123");
      officerToken = await login("officer1", "password123");
      const featureFlagTable = await query(
        `SELECT to_regclass('public.feature_flag') AS table_name`
      );
      if (!featureFlagTable.rows[0]?.table_name) {
        throw new Error("feature_flag table missing (migration 019 not applied)");
      }
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[FEATURE-FLAGS-IT] Skipping DB-backed feature-flag tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  afterAll(async () => {
    invalidateFeatureFlagCache();
    if (app) {
      await app.close();
    }
  });

  beforeEach(async (ctx) => {
    if (!dbReady) {
      ctx.skip();
      return;
    }
    await query(`DELETE FROM feature_flag WHERE flag_key LIKE 'it_%'`);
    invalidateFeatureFlagCache();
  });

  it("allows only admin users to read/update feature flags", async () => {
    const readRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/feature-flags",
      headers: authHeader(officerToken),
    });
    expect(readRes.statusCode).toBe(403);
    expect(JSON.parse(readRes.payload).error).toBe("ADMIN_ACCESS_REQUIRED");

    const writeRes = await putFlag(officerToken, "it_feature_flag_rollout", {
      enabled: true,
    });
    expect(writeRes.statusCode).toBe(403);
    expect(JSON.parse(writeRes.payload).error).toBe("ADMIN_ACCESS_REQUIRED");
  });

  it("enforces strict schema and rejects invalid flag keys", async () => {
    const invalidReadRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/feature-flags?flagKey=INVALID KEY",
      headers: authHeader(adminToken),
    });
    expect(invalidReadRes.statusCode).toBe(400);
    expect(JSON.parse(invalidReadRes.payload).error).toBe("INVALID_FLAG_KEY");

    const invalidBodyRes = await putFlag(adminToken, "it_feature_flag_rollout", {
      enabled: true,
      unknownField: "nope",
    });
    expect(invalidBodyRes.statusCode).toBe(400);
    expect(JSON.parse(invalidBodyRes.payload).error).toBe("INVALID_REQUEST_BODY");
  });

  it("applies authority scope + rollout and invalidates cache on update", async () => {
    const flagKey = "it_feature_flag_rollout";

    const createRes = await putFlag(adminToken, flagKey, {
      enabled: true,
      rolloutPercentage: 100,
      authorityIds: ["PUDA"],
      description: "IT flag for authority scoping",
    });
    expect(createRes.statusCode).toBe(200);

    const readRes = await app.inject({
      method: "GET",
      url: `/api/v1/admin/feature-flags?flagKey=${flagKey}`,
      headers: authHeader(adminToken),
    });
    expect(readRes.statusCode).toBe(200);
    const flags = (JSON.parse(readRes.payload) as {
      flags: Array<{ flagKey: string; enabled: boolean; rolloutPercentage: number }>;
    }).flags;
    expect(flags).toHaveLength(1);
    expect(flags[0].flagKey).toBe(flagKey);
    expect(flags[0].enabled).toBe(true);
    expect(flags[0].rolloutPercentage).toBe(100);

    const allowedAuthority = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "PUDA",
    });
    const deniedAuthority = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "GMADA",
    });
    expect(allowedAuthority).toBe(true);
    expect(deniedAuthority).toBe(false);

    // Populate cache, then ensure route update invalidates cached flag value.
    expect(
      await isFeatureEnabled({ flagKey, userId: "test-officer-1", authorityId: "PUDA" })
    ).toBe(true);

    const disableRes = await putFlag(adminToken, flagKey, {
      enabled: false,
      rolloutPercentage: 100,
      authorityIds: ["PUDA"],
    });
    expect(disableRes.statusCode).toBe(200);

    const disabled = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "PUDA",
    });
    expect(disabled).toBe(false);

    const auditRes = await query(
      `SELECT COUNT(*)::int AS count
       FROM audit_event
       WHERE event_type = 'FEATURE_FLAG_UPDATED'
         AND payload_jsonb->>'flagKey' = $1`,
      [flagKey]
    );
    expect(Number(auditRes.rows[0]?.count || 0)).toBeGreaterThanOrEqual(2);
  });

  it("applies user/role/type/time targeting rules during evaluation", async () => {
    const flagKey = "it_feature_flag_targeting_rules";
    const now = Date.now();
    const activeFrom = new Date(now - 60_000).toISOString();
    const activeTo = new Date(now + 60 * 60 * 1000).toISOString();

    const createRes = await putFlag(adminToken, flagKey, {
      enabled: true,
      rolloutPercentage: 100,
      authorityIds: ["PUDA"],
      userIds: ["test-officer-1"],
      userTypes: ["OFFICER"],
      systemRoles: ["CLERK"],
      activeFrom,
      activeTo,
    });
    expect(createRes.statusCode).toBe(200);

    const matching = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "PUDA",
      userType: "OFFICER",
      systemRoles: ["CLERK"],
      nowMs: now,
    });
    expect(matching).toBe(true);

    const wrongUserType = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "PUDA",
      userType: "CITIZEN",
      systemRoles: ["CLERK"],
      nowMs: now,
    });
    expect(wrongUserType).toBe(false);

    const wrongRole = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "PUDA",
      userType: "OFFICER",
      systemRoles: ["SUPERINTENDENT"],
      nowMs: now,
    });
    expect(wrongRole).toBe(false);

    const wrongUser = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-2",
      authorityId: "PUDA",
      userType: "OFFICER",
      systemRoles: ["CLERK"],
      nowMs: now,
    });
    expect(wrongUser).toBe(false);

    const expiredWindow = await isFeatureEnabled({
      flagKey,
      userId: "test-officer-1",
      authorityId: "PUDA",
      userType: "OFFICER",
      systemRoles: ["CLERK"],
      nowMs: Date.parse(activeTo) + 1,
    });
    expect(expiredWindow).toBe(false);
  });

  it("rejects invalid system role and inverted active window in update payload", async () => {
    const invalidAuthorityRes = await putFlag(adminToken, "it_feature_flag_invalid_authority", {
      enabled: true,
      authorityIds: ["UNKNOWN_AUTHORITY"],
    });
    expect(invalidAuthorityRes.statusCode).toBe(400);
    expect(JSON.parse(invalidAuthorityRes.payload).error).toBe("INVALID_AUTHORITY_ID");

    const invalidRoleRes = await putFlag(adminToken, "it_feature_flag_invalid_role", {
      enabled: true,
      systemRoles: ["NOT_A_REAL_ROLE"],
    });
    expect(invalidRoleRes.statusCode).toBe(400);
    expect(JSON.parse(invalidRoleRes.payload).error).toBe("INVALID_SYSTEM_ROLE");

    const now = Date.now();
    const invertedWindowRes = await putFlag(adminToken, "it_feature_flag_invalid_window", {
      enabled: true,
      activeFrom: new Date(now + 60_000).toISOString(),
      activeTo: new Date(now - 60_000).toISOString(),
    });
    expect(invertedWindowRes.statusCode).toBe(400);
    expect(JSON.parse(invertedWindowRes.payload).error).toBe("INVALID_ACTIVE_WINDOW");
  });
});
