/**
 * Authorization integration tests (DB-backed).
 *
 * Prerequisites:
 * - Postgres running
 * - migrations applied
 * - seed run: npm --workspace apps/api run seed
 */
import path from "path";
import dotenv from "dotenv";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { query } from "./db";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
process.env.RATE_LIMIT_MAX = "10000";

describe("Authorization Integration - Hardened Routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let citizen1Token = "";
  let citizen2Token = "";
  let officer1Token = "";
  let adminToken = "";
  let pudaArn = "";
  let gmadaArn = "";
  let gmadaUpn = "";
  let dbReady = false;

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  function parseBody(payload: string): Record<string, unknown> | null {
    if (!payload) return null;
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  function expectForbidden(res: { statusCode: number; payload: string }) {
    expect(res.statusCode).toBe(403);
    const body = parseBody(res.payload);
    if (body) {
      expect(body.error).toBe("FORBIDDEN");
    }
  }

  function expectBadRequest(
    res: { statusCode: number; payload: string },
    errorCode?: string
  ) {
    expect(res.statusCode).toBe(400);
    if (!errorCode) return;
    const body = parseBody(res.payload);
    if (body) {
      expect(body.error).toBe(errorCode);
    }
  }

  function holidaysFromPayload(payload: string): Array<{
    authority_id: string;
    holiday_date: string;
    description: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.holidays)) {
      return [];
    }
    return body.holidays as Array<{
      authority_id: string;
      holiday_date: string;
      description: string;
    }>;
  }

  function applicationsFromPayload(payload: string): Array<{
    arn: string;
    authority_id: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.applications)) {
      return [];
    }
    return body.applications as Array<{ arn: string; authority_id: string }>;
  }

  function usersFromPayload(payload: string): Array<{
    user_id: string;
    user_type: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.users)) {
      return [];
    }
    return body.users as Array<{ user_id: string; user_type: string }>;
  }

  function postingsFromPayload(payload: string): Array<{
    authority_id: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.postings)) {
      return [];
    }
    return body.postings as Array<{ authority_id: string }>;
  }

  function designationsFromPayload(payload: string): Array<{
    authority_id: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.designations)) {
      return [];
    }
    return body.designations as Array<{ authority_id: string }>;
  }

  function tasksFromPayload(payload: string): Array<{
    task_id: string;
    arn: string;
    authority_id?: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.tasks)) {
      return [];
    }
    return body.tasks as Array<{ task_id: string; arn: string; authority_id?: string }>;
  }

  function inspectionsFromPayload(payload: string): Array<{
    inspection_id: string;
    arn: string;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.inspections)) {
      return [];
    }
    return body.inspections as Array<{ inspection_id: string; arn: string }>;
  }

  function logsFromPayload(payload: string): Array<{
    log_id: string;
    arn: string | null;
  }> {
    const body = parseBody(payload);
    if (!body || !Array.isArray(body.logs)) {
      return [];
    }
    return body.logs as Array<{ log_id: string; arn: string | null }>;
  }

  function sumCountRows(rows: Array<{ count: string | number }>): number {
    return rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  }

  async function login(loginId: string, password: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: loginId, password },
    });
    if (res.statusCode !== 200) {
      throw new Error(`LOGIN_FAILED_${res.statusCode}`);
    }
    const body = JSON.parse(res.payload);
    if (!body.token) {
      throw new Error("LOGIN_TOKEN_MISSING");
    }
    return body.token as string;
  }

  async function ingestCacheTelemetry(
    token: string,
    suffix = `${Date.now()}`
  ): Promise<void> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/client-telemetry/cache",
      headers: authHeader(token),
      payload: {
        app: "citizen",
        clientUpdatedAt: new Date().toISOString(),
        counterDelta: {
          cache_fallback_offline: 1,
          cache_fallback_error: 0,
          stale_data_served: 1,
        },
        sourceDelta: {
          [`cache_fallback_offline:dashboard_${suffix}`]: 1,
          [`stale_data_served:dashboard_${suffix}`]: 1,
        },
      },
    });
    expect(res.statusCode).toBe(202);
  }

  async function createTempGmadaOfficer(stamp: number): Promise<{
    userId: string;
    cleanup: () => Promise<void>;
  }> {
    const userId = `authz-gmada-officer-${stamp}`;
    const loginId = `authz-gmada-officer-${stamp}`;
    const designationId = `AUTHZ_GMADA_CLERK_${stamp}`;
    const designationName = `Authz Temp Clerk ${stamp}`;
    const postingId = `AUTHZ_POSTING_GMADA_${stamp}`;

    await query(
      `INSERT INTO "user" (user_id, login, password_hash, name, email, user_type, profile_jsonb)
       SELECT $1, $2, password_hash, $3, $4, $5, '{}'::jsonb
       FROM "user"
       WHERE user_id = $6`,
      [
        userId,
        loginId,
        `Authz GMADA Officer ${stamp}`,
        `authz.gmada.${stamp}@test.puda.gov.in`,
        "OFFICER",
        "test-officer-1",
      ]
    );
    await query(
      `INSERT INTO designation (designation_id, authority_id, designation_name)
       VALUES ($1, $2, $3)`,
      [designationId, "GMADA", designationName]
    );
    await query(
      `INSERT INTO designation_role_map (authority_id, designation_id, system_role_id)
       VALUES ($1, $2, $3)`,
      ["GMADA", designationId, "CLERK"]
    );
    await query(
      `INSERT INTO user_posting (posting_id, user_id, authority_id, designation_id)
       VALUES ($1, $2, $3, $4)`,
      [postingId, userId, "GMADA", designationId]
    );

    return {
      userId,
      cleanup: async () => {
        await query(`DELETE FROM user_posting WHERE posting_id = $1`, [postingId]);
        await query(
          `DELETE FROM designation_role_map
           WHERE authority_id = $1 AND designation_id = $2 AND system_role_id = $3`,
          ["GMADA", designationId, "CLERK"]
        );
        await query(`DELETE FROM designation WHERE designation_id = $1`, [designationId]);
        await query(`DELETE FROM "user" WHERE user_id = $1`, [userId]);
      },
    };
  }

  beforeAll(async () => {
    app = await buildApp(false);
    try {
      citizen1Token = await login("citizen1", "password123");
      citizen2Token = await login("citizen2", "password123");
      officer1Token = await login("officer1", "password123"); // posted only in PUDA
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
             user_type = EXCLUDED.user_type,
             profile_jsonb = EXCLUDED.profile_jsonb`,
        [
          "test-admin-authz",
          "admin-authz",
          "Authz Admin",
          "authz.admin@test.puda.gov.in",
          "ADMIN",
          "test-officer-1",
        ]
      );
      adminToken = await login("admin-authz", "password123");

      const stamp = Date.now();

      const pudaCreate = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        headers: authHeader(citizen1Token),
        payload: {
          authorityId: "PUDA",
          serviceKey: "no_due_certificate",
          data: {
            applicant: { full_name: "Authz PUDA Applicant" },
            property: { upn: `AUTHZ-PUDA-${stamp}` },
          },
        },
      });
      expect(pudaCreate.statusCode).toBe(200);
      pudaArn = JSON.parse(pudaCreate.payload).arn;
      expect(typeof pudaArn).toBe("string");

      gmadaUpn = `AUTHZ-GMADA-${stamp}`;
      const gmadaCreate = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        headers: authHeader(citizen1Token),
        payload: {
          authorityId: "GMADA",
          serviceKey: "no_due_certificate",
          data: {
            applicant: { full_name: "Authz GMADA Applicant" },
            property: { upn: gmadaUpn },
          },
        },
      });
      expect(gmadaCreate.statusCode).toBe(200);
      gmadaArn = JSON.parse(gmadaCreate.payload).arn;
      expect(typeof gmadaArn).toBe("string");
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[AUTHZ-IT] Skipping DB-backed authz integration tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) {
      ctx.skip();
    }
  });

  it("denies cross-user application read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${pudaArn}`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(res);
  });

  it("denies cross-user payments read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/payments/for-application/${pudaArn}`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(res);
  });

  it("denies cross-user queries read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/queries/for-application/${pudaArn}`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(res);
  });

  it("denies cross-user output read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/outputs/latest/${pudaArn}`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(res);
  });

  it("denies cross-user document metadata and download access", async () => {
    const boundary = `----AuthzDocBoundary${Date.now()}`;
    const uploadBody =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="arn"\r\n\r\n${pudaArn}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="docTypeId"\r\n\r\nidentity_proof\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="userId"\r\n\r\ntest-citizen-1\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="authz.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n` +
      `authz document test content\r\n` +
      `--${boundary}--\r\n`;

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/documents/upload",
      headers: {
        ...authHeader(citizen1Token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(200);
    const uploaded = parseBody(uploadRes.payload) as { doc_id?: string } | null;
    expect(uploaded?.doc_id).toBeTruthy();
    const docId = uploaded?.doc_id as string;

    const metadataRes = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${docId}`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(metadataRes);

    const downloadRes = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${docId}/download`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(downloadRes);
  });

  it("denies cross-user application-property read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/application-property/${pudaArn}`,
      headers: authHeader(citizen2Token),
    });
    expectForbidden(res);
  });

  it("denies citizen access to officer inspection queue", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/inspections/my-queue",
      headers: authHeader(citizen1Token),
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer application read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${gmadaArn}`,
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer fee assessment mutation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fees/assess",
      headers: authHeader(officer1Token),
      payload: {
        arn: gmadaArn,
        items: [{ feeHeadCode: "AUTHZ_FEE", amount: 100 }],
      },
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer inspection creation mutation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/inspections",
      headers: authHeader(officer1Token),
      payload: {
        arn: gmadaArn,
        inspectionType: "SITE_VISIT",
      },
    });
    expectForbidden(res);
  });

  it("rejects malformed fee assessment payload with unknown item fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fees/assess",
      headers: authHeader(officer1Token),
      payload: {
        arn: pudaArn,
        items: [{ feeHeadCode: "AUTHZ_FEE", amount: 100, unexpectedField: "x" }],
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects fee assessment when submitted amounts do not match configured schedule", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fees/assess",
      headers: authHeader(officer1Token),
      payload: {
        arn: pudaArn,
        items: [{ feeHeadCode: "NDC_PROCESSING_FEE", amount: 1 }],
      },
    });
    expectBadRequest(res, "FEE_ITEMS_MISMATCH_WITH_SCHEDULE");
  });

  it("rejects malformed login payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        login: "citizen1",
        password: "password123",
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("requires authentication for cache telemetry ingestion", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/client-telemetry/cache",
      payload: {
        app: "citizen",
        clientUpdatedAt: new Date().toISOString(),
        counterDelta: {
          cache_fallback_offline: 1,
          cache_fallback_error: 0,
          stale_data_served: 1,
        },
        sourceDelta: {
          "cache_fallback_offline:dashboard": 1,
        },
      },
    });
    expect(res.statusCode).toBe(401);
    const body = parseBody(res.payload);
    if (body) {
      expect(body.error).toBe("AUTHENTICATION_REQUIRED");
    }
  });

  it("rejects malformed cache telemetry payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/client-telemetry/cache",
      headers: authHeader(citizen1Token),
      payload: {
        app: "citizen",
        clientUpdatedAt: new Date().toISOString(),
        counterDelta: {
          cache_fallback_offline: 1,
          cache_fallback_error: 0,
          stale_data_served: 1,
        },
        sourceDelta: {
          "cache_fallback_offline:dashboard": 1,
        },
        unexpected: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("accepts cache telemetry ingestion and persists audit event", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/client-telemetry/cache",
      headers: authHeader(citizen1Token),
      payload: {
        app: "citizen",
        clientUpdatedAt: new Date().toISOString(),
        counterDelta: {
          cache_fallback_offline: 2,
          cache_fallback_error: 1,
          stale_data_served: 3,
        },
        sourceDelta: {
          "cache_fallback_offline:dashboard": 2,
          "cache_fallback_error:profile": 1,
        },
      },
    });
    expect(res.statusCode).toBe(202);
    const body = parseBody(res.payload);
    expect(typeof body?.eventId).toBe("string");
    const eventId = body?.eventId as string;

    const auditResult = await query(
      `SELECT event_type, actor_type, actor_id, payload_jsonb
       FROM audit_event
       WHERE event_id = $1`,
      [eventId]
    );
    expect(auditResult.rows.length).toBe(1);
    const row = auditResult.rows[0] as {
      event_type: string;
      actor_type: string;
      actor_id: string;
      payload_jsonb: unknown;
    };
    expect(row.event_type).toBe("CLIENT_CACHE_TELEMETRY");
    expect(row.actor_type).toBe("CITIZEN");
    expect(row.actor_id).toBe("test-citizen-1");

    const payload =
      typeof row.payload_jsonb === "string"
        ? (JSON.parse(row.payload_jsonb) as Record<string, unknown>)
        : (row.payload_jsonb as Record<string, unknown>);
    expect(payload.app).toBe("citizen");
    expect((payload.counterDelta as any)?.cache_fallback_offline).toBe(2);
    expect((payload.counterDelta as any)?.cache_fallback_error).toBe(1);
    expect((payload.counterDelta as any)?.stale_data_served).toBe(3);
  });

  it("denies citizen access to admin cache telemetry endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache",
      headers: authHeader(citizen1Token),
    });
    expect(res.statusCode).toBe(403);
    const body = parseBody(res.payload);
    if (body) {
      expect(body.error).toBe("ADMIN_ACCESS_REQUIRED");
    }
  });

  it("scopes officer admin cache telemetry endpoint to allowed authority", async () => {
    await ingestCacheTelemetry(citizen1Token, "scope_authority_filter");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?authorityId=PUDA&bucketMinutes=60&limit=10&sourceLimit=5",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const body = parseBody(res.payload);
    expect(body).toBeTruthy();
    expect(Array.isArray((body as any)?.buckets)).toBe(true);
    expect((body as any)?.scope?.authorityId).toBe("PUDA");
  });

  it("auto-scopes officer cache telemetry read when authorityId is omitted", async () => {
    await ingestCacheTelemetry(citizen1Token, "scope_auto_officer");

    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/telemetry/cache?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=10&sourceLimit=5`,
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const body = parseBody(res.payload);
    expect((body as any)?.scope?.authorityId).toBe("PUDA");
    expect(Array.isArray((body as any)?.buckets)).toBe(true);
  });

  it("denies officer admin cache telemetry endpoint for cross-authority filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?authorityId=GMADA",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("rejects admin cache telemetry endpoint for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?authorityId=UNKNOWN_AUTHORITY",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin cache telemetry endpoint query with unknown filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?unexpected=1",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects admin cache telemetry endpoint with invalid datetime filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?from=not-a-date",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects admin cache telemetry endpoint when to is not a valid datetime", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?to=not-a-date",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects admin cache telemetry endpoint when from is after to", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?from=2026-02-20T10:00:00.000Z&to=2026-02-19T10:00:00.000Z",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects admin cache telemetry endpoint when range exceeds 31 days", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/telemetry/cache?from=2026-01-01T00:00:00.000Z&to=2026-02-15T00:00:00.000Z",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("caps admin cache telemetry query limits to server maximums", async () => {
    await ingestCacheTelemetry(citizen1Token, "cap_limits");
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await app.inject({
      method: "GET",
      url:
        `/api/v1/admin/telemetry/cache?authorityId=PUDA` +
        `&from=${encodeURIComponent(from)}` +
        `&to=${encodeURIComponent(to)}` +
        `&bucketMinutes=60&limit=999999&sourceLimit=999999`,
      headers: authHeader(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = parseBody(res.payload);
    expect((body as any)?.scope?.limit).toBe(500);
    expect((body as any)?.scope?.sourceLimit).toBe(100);
  });

  it("returns empty cache telemetry buckets for windows with no matching events", async () => {
    const res = await app.inject({
      method: "GET",
      url:
        "/api/v1/admin/telemetry/cache" +
        "?authorityId=PUDA" +
        "&from=2099-01-01T00:00:00.000Z" +
        "&to=2099-01-01T01:00:00.000Z" +
        "&bucketMinutes=60",
      headers: authHeader(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = parseBody(res.payload);
    expect((body as any)?.buckets).toEqual([]);
    expect((body as any)?.totals).toEqual({
      events: 0,
      cacheFallbackOffline: 0,
      cacheFallbackError: 0,
      staleDataServed: 0,
    });
  });

  it("rejects malformed forgot-password payload without login", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: {},
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed reset-password payload without token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        newPassword: "password123",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed notification read payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/non-existent/read",
      headers: authHeader(citizen1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed fee demand payload without lineItemIds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/fees/demands",
      headers: authHeader(officer1Token),
      payload: {
        arn: pudaArn,
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed payment create payload without amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: authHeader(citizen1Token),
      payload: {
        arn: pudaArn,
        mode: "UPI",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed payment verify payload without gatewaySignature", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/non-existent/verify",
      headers: authHeader(officer1Token),
      payload: {
        gatewayPaymentId: "gp_test",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed refund payload without reason", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/refunds",
      headers: authHeader(citizen1Token),
      payload: {
        arn: pudaArn,
        paymentId: "payment_test",
        amount: 10,
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed inspection create payload without inspectionType", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/inspections",
      headers: authHeader(officer1Token),
      payload: {
        arn: pudaArn,
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed inspection assign payload without officerUserId", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/inspections/non-existent/assign",
      headers: authHeader(officer1Token),
      payload: {
        officerRoleId: "CLERK",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed inspection complete payload for invalid outcome", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/inspections/non-existent/complete",
      headers: authHeader(officer1Token),
      payload: {
        outcome: "INVALID",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed notice create payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/notices",
      headers: authHeader(officer1Token),
      payload: {
        arn: pudaArn,
        noticeType: "QUERY",
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed notice dispatch payload without dispatchMode", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/notices/non-existent/dispatch",
      headers: authHeader(officer1Token),
      payload: {},
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed task action payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/non-existent/actions",
      headers: authHeader(officer1Token),
      payload: {
        action: "FORWARD",
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed task assign payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks/non-existent/assign",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed inspection cancel payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/inspections/non-existent/cancel",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed demand waive payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/fees/demands/non-existent/waive",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed demand cancel payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/fees/demands/non-existent/cancel",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed refund approve payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/refunds/non-existent/approve",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed refund reject payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/refunds/non-existent/reject",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed refund process payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/refunds/non-existent/process",
      headers: authHeader(officer1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed application update payload with unknown fields", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/applications/${pudaArn}`,
      headers: authHeader(citizen1Token),
      payload: {
        data: {
          applicant: { full_name: "Authz Update Test" },
        },
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed application query-response payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/applications/${pudaArn}/query-response`,
      headers: authHeader(citizen1Token),
      payload: {
        queryId: "QUERY_TEST",
        responseMessage: "response",
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects malformed application query-response payload without responseMessage", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/applications/${pudaArn}/query-response`,
      headers: authHeader(citizen1Token),
      payload: {
        queryId: "QUERY_TEST",
      },
    });
    expectBadRequest(res, "RESPONSE_MESSAGE_REQUIRED");
  });

  it("rejects malformed application submit payload with unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/applications/${pudaArn}/submit`,
      headers: authHeader(citizen1Token),
      payload: {
        unknownField: "x",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects multipart document upload with unknown form fields", async () => {
    const boundary = `----AuthzBoundary${Date.now()}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="arn"\r\n\r\n${pudaArn}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="docTypeId"\r\n\r\nidentity_proof\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="userId"\r\n\r\ntest-citizen-1\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="unexpectedField"\r\n\r\nx\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="test.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n` +
      `test content\r\n` +
      `--${boundary}--\r\n`;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/documents/upload",
      headers: {
        ...authHeader(citizen1Token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expectBadRequest(res, "INVALID_FIELDS");
  });

  it("rejects tasks inbox query with unknown filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/inbox?status=PENDING&limit=20&unexpected=1",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects tasks inbox query with negative limit", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/inbox?status=PENDING&limit=-1",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects notification my-logs query with non-numeric limit", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notification-logs/my-logs?limit=abc",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects applications search query with unknown filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/search?searchTerm=AUTHZ&unexpected=1",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects admin users query with unknown filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?limit=20&unexpected=1",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("rejects properties search query with unknown filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/properties/search?authorityId=PUDA&unexpected=1",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_QUERY_PARAMS");
  });

  it("denies cross-authority officer property search", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/properties/search?authorityId=GMADA",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer property by-upn lookup", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/properties/by-upn?authorityId=GMADA&upn=${encodeURIComponent(gmadaUpn)}`,
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("rejects officer property search for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/properties/search?authorityId=UNKNOWN_AUTHORITY",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects officer property search for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/properties/search?authorityId=gmada",
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects officer property by-upn lookup for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/properties/by-upn?authorityId=UNKNOWN_AUTHORITY&upn=${encodeURIComponent(gmadaUpn)}`,
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects officer property by-upn lookup for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/properties/by-upn?authorityId=gmada&upn=${encodeURIComponent(gmadaUpn)}`,
      headers: authHeader(officer1Token),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("does not leak cross-authority tasks in officer inbox without authority filter", async () => {
    const stamp = Date.now();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: authHeader(citizen1Token),
      payload: {
        authorityId: "GMADA",
        serviceKey: "no_due_certificate",
        data: {
          applicant: { full_name: "Authz Inbox GMADA Applicant" },
          property: { upn: `AUTHZ-GMADA-INBOX-${stamp}` },
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const createdArn = JSON.parse(createRes.payload).arn as string;

    const submitRes = await app.inject({
      method: "POST",
      url: `/api/v1/applications/${createdArn}/submit`,
      headers: authHeader(citizen1Token),
    });
    expect(submitRes.statusCode).toBe(200);

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/applications/${createdArn}`,
      headers: authHeader(citizen1Token),
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = parseBody(detailRes.payload);
    const createdTasks = Array.isArray(detailBody?.tasks) ? detailBody?.tasks : [];
    expect(createdTasks.length).toBeGreaterThan(0);

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/inbox?status=PENDING&limit=200",
      headers: authHeader(officer1Token),
    });
    expect(inboxRes.statusCode).toBe(200);
    const inboxTasks = tasksFromPayload(inboxRes.payload);
    expect(inboxTasks.some((task) => task.arn === createdArn)).toBe(false);
    expect(
      inboxTasks.every((task) => !task.authority_id || task.authority_id === "PUDA")
    ).toBe(true);
  });

  it("denies cross-authority officer inbox filter by authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/inbox?authorityId=GMADA&status=PENDING",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("does not leak cross-authority inspections in officer queue", async () => {
    const inspectionId = `AUTHZ-GMADA-INSP-${Date.now()}`;
    await query(
      `INSERT INTO inspection (
         inspection_id, arn, inspection_type, status,
         officer_user_id, officer_role_id
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [inspectionId, gmadaArn, "SITE_VISIT", "SCHEDULED", "test-officer-1", "CLERK"]
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/inspections/my-queue?includeCompleted=true",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const inspections = inspectionsFromPayload(res.payload);
    expect(inspections.some((inspection) => inspection.inspection_id === inspectionId)).toBe(false);
    expect(inspections.some((inspection) => inspection.arn === gmadaArn)).toBe(false);
  });

  it("denies cross-authority officer inspection queue filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/inspections/my-queue?authorityId=GMADA",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies citizen application search", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/search?searchTerm=AUTHZ",
      headers: authHeader(citizen1Token),
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer notification logs for application", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/notification-logs/for-application/${gmadaArn}`,
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer notification stats for application", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/notification-logs/stats/${gmadaArn}`,
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies cross-authority officer notification my-logs filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notification-logs/my-logs?authorityId=GMADA&limit=20",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("does not leak cross-authority officer notification my-logs without authority filter", async () => {
    const logId = `AUTHZ-GMADA-LOG-${Date.now()}`;
    await query(
      `INSERT INTO notification_log (
         log_id, arn, user_id, channel, status, subject, body
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        logId,
        gmadaArn,
        "test-officer-1",
        "IN_APP",
        "DELIVERED",
        "Cross authority log",
        "Should not be visible",
      ]
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notification-logs/my-logs?limit=200",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const logs = logsFromPayload(res.payload);
    expect(logs.some((log) => log.log_id === logId)).toBe(false);
    expect(logs.some((log) => log.arn === gmadaArn)).toBe(false);
  });

  it("requires authorityId for multi-posted officer list endpoints", async () => {
    const stamp = Date.now();
    const designationId = `AUTHZ_GMADA_CLERK_${stamp}`;
    const designationName = `Authz Temp Clerk ${stamp}`;
    const postingId = `AUTHZ_POSTING_OFFICER1_GMADA_${stamp}`;

    await query(
      `INSERT INTO designation (designation_id, authority_id, designation_name)
       VALUES ($1, $2, $3)`,
      [designationId, "GMADA", designationName]
    );
    await query(
      `INSERT INTO designation_role_map (authority_id, designation_id, system_role_id)
       VALUES ($1, $2, $3)`,
      ["GMADA", designationId, "CLERK"]
    );
    await query(
      `INSERT INTO user_posting (posting_id, user_id, authority_id, designation_id)
       VALUES ($1, $2, $3, $4)`,
      [postingId, "test-officer-1", "GMADA", designationId]
    );

    try {
      const inboxWithoutAuthority = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/inbox?status=PENDING&limit=20",
        headers: authHeader(officer1Token),
      });
      expectBadRequest(inboxWithoutAuthority, "AUTHORITY_ID_REQUIRED");

      const inspectionsWithoutAuthority = await app.inject({
        method: "GET",
        url: "/api/v1/inspections/my-queue?includeCompleted=true",
        headers: authHeader(officer1Token),
      });
      expectBadRequest(inspectionsWithoutAuthority, "AUTHORITY_ID_REQUIRED");

      const logsWithoutAuthority = await app.inject({
        method: "GET",
        url: "/api/v1/notification-logs/my-logs?limit=20",
        headers: authHeader(officer1Token),
      });
      expectBadRequest(logsWithoutAuthority, "AUTHORITY_ID_REQUIRED");

      const adminUsersWithoutAuthority = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users?limit=20",
        headers: authHeader(officer1Token),
      });
      expectBadRequest(adminUsersWithoutAuthority, "AUTHORITY_ID_REQUIRED");

      const adminPostingsWithoutAuthority = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users/test-officer-1/postings",
        headers: authHeader(officer1Token),
      });
      expectBadRequest(adminPostingsWithoutAuthority, "AUTHORITY_ID_REQUIRED");

      const adminStatsWithoutAuthority = await app.inject({
        method: "GET",
        url: "/api/v1/admin/stats",
        headers: authHeader(officer1Token),
      });
      expectBadRequest(adminStatsWithoutAuthority, "AUTHORITY_ID_REQUIRED");

      const inboxScoped = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/inbox?authorityId=PUDA&status=PENDING&limit=20",
        headers: authHeader(officer1Token),
      });
      expect(inboxScoped.statusCode).toBe(200);

      const inspectionsScoped = await app.inject({
        method: "GET",
        url: "/api/v1/inspections/my-queue?authorityId=PUDA&includeCompleted=true",
        headers: authHeader(officer1Token),
      });
      expect(inspectionsScoped.statusCode).toBe(200);

      const logsScoped = await app.inject({
        method: "GET",
        url: "/api/v1/notification-logs/my-logs?authorityId=PUDA&limit=20",
        headers: authHeader(officer1Token),
      });
      expect(logsScoped.statusCode).toBe(200);

      const adminUsersScoped = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users?authorityId=PUDA&limit=20",
        headers: authHeader(officer1Token),
      });
      expect(adminUsersScoped.statusCode).toBe(200);

      const adminPostingsScoped = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users/test-officer-1/postings?authorityId=PUDA",
        headers: authHeader(officer1Token),
      });
      expect(adminPostingsScoped.statusCode).toBe(200);
      const scopedPostings = postingsFromPayload(adminPostingsScoped.payload);
      expect(scopedPostings.length).toBeGreaterThan(0);
      expect(scopedPostings.every((posting) => posting.authority_id === "PUDA")).toBe(true);

      const adminStatsScoped = await app.inject({
        method: "GET",
        url: "/api/v1/admin/stats?authorityId=PUDA",
        headers: authHeader(officer1Token),
      });
      expect(adminStatsScoped.statusCode).toBe(200);
    } finally {
      await query(`DELETE FROM user_posting WHERE posting_id = $1`, [postingId]);
      await query(
        `DELETE FROM designation_role_map
         WHERE authority_id = $1 AND designation_id = $2 AND system_role_id = $3`,
        ["GMADA", designationId, "CLERK"]
      );
      await query(`DELETE FROM designation WHERE designation_id = $1`, [designationId]);
    }
  });

  it("scopes officer search to posted authority when authorityId is omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/search?searchTerm=AUTHZ",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const apps = applicationsFromPayload(res.payload);
    expect(apps.length).toBeGreaterThan(0);
    expect(apps.every((app) => app.authority_id === "PUDA")).toBe(true);
    expect(apps.some((app) => app.arn === pudaArn)).toBe(true);
    expect(apps.some((app) => app.arn === gmadaArn)).toBe(false);
  });

  it("denies cross-authority officer application search when authorityId is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/search?authorityId=GMADA&searchTerm=AUTHZ",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("scopes officer export to posted authority", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/export?searchTerm=AUTHZ",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload.includes(pudaArn)).toBe(true);
    expect(res.payload.includes(gmadaArn)).toBe(false);
  });

  it("rejects admin application search for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/search?authorityId=UNKNOWN_AUTHORITY&searchTerm=AUTHZ",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin application search for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/search?authorityId=gmada&searchTerm=AUTHZ",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin application export for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/export?authorityId=UNKNOWN_AUTHORITY&searchTerm=AUTHZ",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin application export for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/applications/export?authorityId=gmada&searchTerm=AUTHZ",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects citizen application create for unknown authorityId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: authHeader(citizen1Token),
      payload: {
        authorityId: "UNKNOWN_AUTHORITY",
        serviceKey: "no_due_certificate",
        data: {
          applicant: { full_name: "Authz Invalid Authority Applicant" },
        },
      },
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects citizen application create for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: authHeader(citizen1Token),
      payload: {
        authorityId: "gmada",
        serviceKey: "no_due_certificate",
        data: {
          applicant: { full_name: "Authz Invalid Authority Applicant" },
        },
      },
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("denies citizen access to admin user listing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?limit=5",
      headers: authHeader(citizen1Token),
    });
    expect(res.statusCode).toBe(403);
    const body = parseBody(res.payload);
    if (body) {
      expect(body.error).toBe("ADMIN_ACCESS_REQUIRED");
      expect(body.users).toBeUndefined();
    }
  });

  it("denies officer admin holidays read for cross-authority filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/holidays?authorityId=GMADA",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies officer admin designations read for cross-authority filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/designations?authorityId=GMADA",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("denies officer listing citizen users via admin users endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?userType=CITIZEN&limit=10",
      headers: authHeader(officer1Token),
    });
    expectForbidden(res);
  });

  it("scopes officer admin users listing to officer users in posted authorities", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?limit=200",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const users = usersFromPayload(res.payload);
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((user) => user.user_type === "OFFICER")).toBe(true);
  });

  it("scopes officer admin postings lookup to posted authorities", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users/test-officer-1/postings",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const postings = postingsFromPayload(res.payload);
    expect(postings.length).toBeGreaterThan(0);
    expect(postings.every((posting) => posting.authority_id === "PUDA")).toBe(true);
  });

  it("denies officer admin postings lookup for out-of-scope target users", async () => {
    const tempOfficer = await createTempGmadaOfficer(Date.now());
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/admin/users/${tempOfficer.userId}/postings?authorityId=PUDA`,
        headers: authHeader(officer1Token),
      });
      expectForbidden(res);
    } finally {
      await tempOfficer.cleanup();
    }
  });

  it("scopes officer admin designations listing to posted authorities when authorityId omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/designations",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const designations = designationsFromPayload(res.payload);
    expect(designations.length).toBeGreaterThan(0);
    expect(designations.every((designation) => designation.authority_id === "PUDA")).toBe(true);
  });

  it("applies authorityId filter for admin user listing", async () => {
    const tempOfficer = await createTempGmadaOfficer(Date.now());
    try {
      const pudaRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users?authorityId=PUDA&userType=OFFICER&limit=500",
        headers: authHeader(adminToken),
      });
      expect(pudaRes.statusCode).toBe(200);
      const pudaUsers = usersFromPayload(pudaRes.payload);
      expect(pudaUsers.some((user) => user.user_id === tempOfficer.userId)).toBe(false);

      const gmadaRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users?authorityId=GMADA&userType=OFFICER&limit=500",
        headers: authHeader(adminToken),
      });
      expect(gmadaRes.statusCode).toBe(200);
      const gmadaUsers = usersFromPayload(gmadaRes.payload);
      expect(gmadaUsers.some((user) => user.user_id === tempOfficer.userId)).toBe(true);
    } finally {
      await tempOfficer.cleanup();
    }
  });

  it("rejects admin user listing for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?authorityId=UNKNOWN_AUTHORITY&userType=OFFICER&limit=50",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin user listing for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?authorityId=gmada&userType=OFFICER&limit=50",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin holidays read for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/holidays?authorityId=UNKNOWN_AUTHORITY",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin holidays create for unknown authorityId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "UNKNOWN_AUTHORITY",
        holidayDate: "2099-12-10",
        description: "AUTHZ_UNKNOWN_AUTHORITY",
      },
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin holidays create for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "gmada",
        holidayDate: "2099-12-11",
        description: "AUTHZ_INVALID_AUTHORITY",
      },
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin holidays create when holidayDate is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "PUDA",
        description: "AUTHZ_MISSING_HOLIDAY_DATE",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects admin holidays create when description is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "PUDA",
        holidayDate: "2099-12-13",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects admin holidays create for invalid holidayDate format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "PUDA",
        holidayDate: "2099/12/13",
        description: "AUTHZ_INVALID_HOLIDAY_DATE",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects admin holidays delete for unknown authorityId", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "UNKNOWN_AUTHORITY",
        holidayDate: "2099-12-10",
      },
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin holidays delete for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "gmada",
        holidayDate: "2099-12-11",
      },
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin holidays delete when holidayDate is missing", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "PUDA",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects admin holidays delete for invalid holidayDate format", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        authorityId: "PUDA",
        holidayDate: "2099/12/13",
      },
    });
    expectBadRequest(res, "INVALID_REQUEST_BODY");
  });

  it("rejects admin holidays create when authorityId is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        holidayDate: "2099-12-12",
        description: "AUTHZ_MISSING_AUTHORITY",
      },
    });
    expectBadRequest(res, "AUTHORITY_ID_REQUIRED");
  });

  it("rejects admin holidays delete when authorityId is missing", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/holidays",
      headers: authHeader(adminToken),
      payload: {
        holidayDate: "2099-12-12",
      },
    });
    expectBadRequest(res, "AUTHORITY_ID_REQUIRED");
  });

  it("scopes officer admin stats to authority context", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/stats",
      headers: authHeader(officer1Token),
    });
    expect(res.statusCode).toBe(200);
    const body = parseBody(res.payload);
    expect(body).not.toBeNull();
    const users = Array.isArray(body?.users) ? (body?.users as Array<{ user_type: string }>) : [];
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((row) => row.user_type === "OFFICER")).toBe(true);
  });

  it("applies authorityId filter for admin stats", async () => {
    const pudaCountResult = await query(
      `SELECT COUNT(*)::int AS count FROM application WHERE authority_id = $1`,
      ["PUDA"]
    );
    const gmadaCountResult = await query(
      `SELECT COUNT(*)::int AS count FROM application WHERE authority_id = $1`,
      ["GMADA"]
    );
    const pudaDbCount = Number(pudaCountResult.rows[0]?.count || 0);
    const gmadaDbCount = Number(gmadaCountResult.rows[0]?.count || 0);

    const pudaRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/stats?authorityId=PUDA",
      headers: authHeader(adminToken),
    });
    expect(pudaRes.statusCode).toBe(200);
    const pudaBody = parseBody(pudaRes.payload);
    expect(pudaBody).not.toBeNull();
    const pudaAppsByState = Array.isArray(pudaBody?.applicationsByState)
      ? (pudaBody?.applicationsByState as Array<{ count: string | number }>)
      : [];
    expect(sumCountRows(pudaAppsByState)).toBe(pudaDbCount);

    const gmadaRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/stats?authorityId=GMADA",
      headers: authHeader(adminToken),
    });
    expect(gmadaRes.statusCode).toBe(200);
    const gmadaBody = parseBody(gmadaRes.payload);
    expect(gmadaBody).not.toBeNull();
    const gmadaAppsByState = Array.isArray(gmadaBody?.applicationsByState)
      ? (gmadaBody?.applicationsByState as Array<{ count: string | number }>)
      : [];
    expect(sumCountRows(gmadaAppsByState)).toBe(gmadaDbCount);
  });

  it("rejects admin stats for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/stats?authorityId=UNKNOWN_AUTHORITY",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin stats for invalid authorityId format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/stats?authorityId=gmada",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("rejects admin designations read for unknown authorityId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/designations?authorityId=UNKNOWN_AUTHORITY",
      headers: authHeader(adminToken),
    });
    expectBadRequest(res, "INVALID_AUTHORITY_ID");
  });

  it("denies officer admin mutation and prevents holiday write side effects", async () => {
    const year = 2099;

    const beforeRes = await app.inject({
      method: "GET",
      url: `/api/v1/admin/holidays?authorityId=PUDA&year=${year}`,
      headers: authHeader(officer1Token),
    });
    expect(beforeRes.statusCode).toBe(200);
    const beforeHolidays = holidaysFromPayload(beforeRes.payload);
    const usedDates = new Set(beforeHolidays.map((h) => String(h.holiday_date).slice(0, 10)));

    let holidayDate = "";
    for (let day = 1; day <= 28; day += 1) {
      const candidate = `2099-12-${String(day).padStart(2, "0")}`;
      if (!usedDates.has(candidate)) {
        holidayDate = candidate;
        break;
      }
    }
    if (!holidayDate) {
      throw new Error("NO_AVAILABLE_TEST_HOLIDAY_DATE");
    }

    const description = `AUTHZ_GUARD_${Date.now()}`;
    const postRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/holidays",
      headers: authHeader(officer1Token),
      payload: {
        authorityId: "PUDA",
        holidayDate,
        description,
      },
    });
    expect(postRes.statusCode).toBe(403);
    const postBody = parseBody(postRes.payload);
    if (postBody) {
      expect(postBody.error).toBe("ADMIN_ACCESS_REQUIRED");
    }

    const afterRes = await app.inject({
      method: "GET",
      url: `/api/v1/admin/holidays?authorityId=PUDA&year=${year}`,
      headers: authHeader(officer1Token),
    });
    expect(afterRes.statusCode).toBe(200);
    const afterHolidays = holidaysFromPayload(afterRes.payload);
    const insertedHoliday = afterHolidays.find(
      (h) =>
        String(h.holiday_date).slice(0, 10) === holidayDate &&
        h.description === description
    );
    expect(insertedHoliday).toBeUndefined();
  });
});
