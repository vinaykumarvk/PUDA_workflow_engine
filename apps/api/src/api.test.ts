/**
 * API integration tests for PUDA Workflow Engine.
 * Prerequisites: Postgres running, migrations applied, seed run (npm --workspace apps/api run seed).
 */
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { buildApp } from "./app";

const CITIZEN_USER_ID = "test-citizen-1";
const CITIZEN_LOGIN = "citizen1";
const CITIZEN_PASSWORD = "password123";
const OFFICER_USER_ID = "test-officer-1";
const SR_ASSISTANT_OFFICER_USER_ID = "test-officer-2";
const ACCOUNT_OFFICER_USER_ID = "test-officer-3";
const OFFICER_LOGIN = "officer1";
const OFFICER_PASSWORD = "password123";
const AUTHORITY_ID = "PUDA";
const SERVICE_KEY = "no_due_certificate";

describe("PUDA Workflow Engine API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let citizenToken: string;
  let officerToken: string;
  let rawInject: ((opts: Parameters<typeof app.inject>[0]) => ReturnType<typeof app.inject>) | null = null;
  let dbReady = false;

  function isPublicRoute(url: string): boolean {
    const pathOnly = url.split("?")[0];
    return (
      pathOnly === "/health" ||
      pathOnly === "/ready" ||
      pathOnly === "/metrics" ||
      pathOnly === "/api/v1/openapi.json" ||
      pathOnly.startsWith("/docs") ||
      pathOnly.startsWith("/api/v1/auth/") ||
      pathOnly.startsWith("/api/v1/config/") ||
      pathOnly === "/api/v1/payments/callback"
    );
  }

  function shouldUseOfficerToken(url: string): boolean {
    const pathOnly = url.split("?")[0];
    return (
      pathOnly.startsWith("/api/v1/tasks") ||
      pathOnly.startsWith("/api/v1/admin")
    );
  }

  function injectWithDefaultAuth(opts: Parameters<typeof app.inject>[0]) {
    if (!rawInject) {
      throw new Error("INJECT_NOT_INITIALIZED");
    }
    const requestOpts = typeof opts === "string" ? { url: opts, method: "GET" as const } : { ...opts };
    const url = String((requestOpts as any).url || "");
    const headers = { ...((requestOpts as any).headers || {}) } as Record<string, string>;
    const hasAuthHeader = Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
    if (!hasAuthHeader && !isPublicRoute(url)) {
      const token = shouldUseOfficerToken(url) ? officerToken : citizenToken;
      headers.authorization = `Bearer ${token}`;
    }
    (requestOpts as any).headers = headers;
    return rawInject(requestOpts as any);
  }

  /** Helper to build injection headers with JWT auth */
  function citizenHeaders(): Record<string, string> {
    return { authorization: `Bearer ${citizenToken}` };
  }
  function officerHeaders(): Record<string, string> {
    return { authorization: `Bearer ${officerToken}` };
  }

  /** Inject with citizen auth */
  function citizenInject(opts: Parameters<typeof app.inject>[0]) {
    const o = typeof opts === "string" ? { url: opts, method: "GET" as const } : { ...opts };
    o.headers = { ...(o.headers || {}), authorization: `Bearer ${citizenToken}` };
    return app.inject(o);
  }
  /** Inject with officer auth */
  function officerInject(opts: Parameters<typeof app.inject>[0]) {
    const o = typeof opts === "string" ? { url: opts, method: "GET" as const } : { ...opts };
    o.headers = { ...(o.headers || {}), authorization: `Bearer ${officerToken}` };
    return app.inject(o);
  }

  beforeAll(async () => {
    app = await buildApp(false);
    rawInject = app.inject.bind(app);
    try {
      // Authenticate and capture tokens
      const citizenRes = await rawInject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: CITIZEN_LOGIN, password: CITIZEN_PASSWORD },
      });
      const officerRes = await rawInject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: OFFICER_LOGIN, password: OFFICER_PASSWORD },
      });
      if (citizenRes.statusCode !== 200 || officerRes.statusCode !== 200) {
        throw new Error(`LOGIN_BOOTSTRAP_FAILED_${citizenRes.statusCode}_${officerRes.statusCode}`);
      }
      citizenToken = JSON.parse(citizenRes.payload).token || "";
      officerToken = JSON.parse(officerRes.payload).token || "";
      (app as any).inject = injectWithDefaultAuth;
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[API-IT] Skipping DB-backed API tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) {
      ctx.skip();
    }
  });

  describe("1. Health", () => {
    it("GET /health returns 200 and status ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ status: "ok" });
    });
  });

  describe("2. Auth", () => {
    it("POST /api/v1/auth/login with valid citizen credentials returns user + JWT token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: CITIZEN_LOGIN, password: CITIZEN_PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.error).toBeUndefined();
      expect(body.user).toBeDefined();
      expect(body.user.login).toBe(CITIZEN_LOGIN);
      expect(body.user.user_type).toBe("CITIZEN");
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
    });

    it("POST /api/v1/auth/login with valid officer credentials returns user + JWT token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: OFFICER_LOGIN, password: OFFICER_PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.user.login).toBe(OFFICER_LOGIN);
      expect(body.user.user_type).toBe("OFFICER");
      expect(body.token).toBeDefined();
    });

    it("POST /api/v1/auth/login with invalid password returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: CITIZEN_LOGIN, password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error).toBe("INVALID_CREDENTIALS");
    });

    it("POST /api/v1/auth/login with missing body returns 400 or 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {},
      });
      expect([400, 401]).toContain(res.statusCode);
    });
  });

  describe("3. Config", () => {
    it("GET /api/v1/config/services returns list of services", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/config/services" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.services)).toBe(true);
      expect(body.services.length).toBeGreaterThan(0);
      const ndc = body.services.find((s: any) => s.serviceKey === SERVICE_KEY);
      expect(ndc).toBeDefined();
      expect(ndc.displayName ?? ndc.name).toBeDefined();
    });

    it("GET /api/v1/config/services/:serviceKey returns full config for no_due_certificate", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/config/services/${SERVICE_KEY}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.serviceKey).toBe(SERVICE_KEY);
      expect(body.form).toBeDefined();
      expect(body.workflow).toBeDefined();
      expect(body.documents).toBeDefined();
      expect(Array.isArray(body.workflow.states)).toBe(true);
      expect(Array.isArray(body.workflow.transitions)).toBe(true);
    });

    it("GET /api/v1/config/services/:serviceKey for unknown service returns 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/config/services/unknown_service",
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).error).toBe("SERVICE_NOT_FOUND");
    });

    it("GET /api/v1/config/services/:serviceKey rejects invalid key format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/config/services/Invalid-Key",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe("INVALID_PATH_PARAMS");
    });
  });

  describe("4. Application lifecycle", () => {
    let draftArn: string;
    let submittedArn: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "Test Applicant" }, property: { upn: "TEST-001" } },
        },
      });
      expect(createRes.statusCode).toBe(200);
      draftArn = JSON.parse(createRes.payload).arn;
    });

    it("POST /api/v1/applications creates draft application", () => {
      expect(draftArn).toBeDefined();
      expect(draftArn).toContain(AUTHORITY_ID);
    });

    it("GET /api/v1/applications/:arn returns application with documents, tasks, timeline", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${draftArn}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.arn).toBe(draftArn);
      expect(body.state_id).toBe("DRAFT");
      expect(Array.isArray(body.documents)).toBe(true);
      expect(Array.isArray(body.queries)).toBe(true);
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(Array.isArray(body.timeline)).toBe(true);
    });

    it("PUT /api/v1/applications/:arn updates application data", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/applications/${draftArn}`,
        payload: {
          userId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "Updated Name" }, property: { upn: "UPD-001" } },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // Applicant payload is normalized from citizen profile; assert mutable property payload update instead.
      expect(body.data_jsonb.property.upn).toBe("UPD-001");
    });

    it("POST /api/v1/applications/:arn/submit submits and returns new submittedArn", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${draftArn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.submittedArn).toBeDefined();
      expect(body.submittedArn).not.toBe(draftArn);
      submittedArn = body.submittedArn;
    });

    it("GET /api/v1/applications/:arn with old draft ARN resolves to submitted application", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${draftArn}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.arn).toBe(submittedArn);
    });

    it("GET /api/v1/applications/:arn with submittedArn returns application in PENDING_AT_CLERK with task", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.arn).toBe(submittedArn);
      expect(body.state_id).toBe("PENDING_AT_CLERK");
      expect(body.tasks.length).toBeGreaterThan(0);
      expect(body.tasks[0].system_role_id).toBe("CLERK");
    });

    it("POST /api/v1/applications/:arn/submit again returns 400 (invalid state)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${submittedArn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("5. Task inbox and actions", () => {
    let submittedArn: string;
    let taskId: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "Inbox Test" }, property: { upn: "INBOX-001" } },
        },
      });
      const createBody = JSON.parse(createRes.payload);
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${createBody.arn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      const submitBody = JSON.parse(submitRes.payload);
      submittedArn = submitBody.submittedArn;
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      const getBody = JSON.parse(getRes.payload);
      taskId = getBody.tasks[0].task_id;
    });

    it("GET /api/v1/tasks/inbox returns tasks for officer", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/inbox?userId=${OFFICER_USER_ID}&authorityId=${AUTHORITY_ID}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks.length).toBeGreaterThan(0);
      const task = body.tasks.find((t: any) => t.arn === submittedArn);
      expect(task).toBeDefined();
    });

    it("POST /api/v1/tasks/:taskId/assign assigns task to officer", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/assign`,
        payload: { userId: OFFICER_USER_ID },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });

    it("POST /api/v1/tasks/:taskId/actions with FORWARD moves to next state", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/actions`,
        payload: { action: "FORWARD", userId: OFFICER_USER_ID, remarks: "Checked" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.newStateId).toBe("PENDING_AT_SR_ASSISTANT_ACCOUNTS");
    });
  });

  describe("6. Query flow", () => {
    let submittedArn: string;
    let clerkTaskId: string;
    let queryId: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "Query Test" }, property: { upn: "QRY-001" } },
        },
      });
      const createBody = JSON.parse(createRes.payload);
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${createBody.arn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      submittedArn = JSON.parse(submitRes.payload).submittedArn;
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      const getBody = JSON.parse(getRes.payload);
      clerkTaskId = getBody.tasks[0].task_id;
      const assignRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/assign`,
        payload: { userId: OFFICER_USER_ID },
      });
      expect(assignRes.statusCode).toBe(200);
      const queryRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/actions`,
        payload: {
          action: "QUERY",
          userId: OFFICER_USER_ID,
          queryMessage: "Please provide proof of identity",
        },
      });
      expect(queryRes.statusCode).toBe(200);
      const appAfterQuery = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      const appBody = JSON.parse(appAfterQuery.payload);
      expect(appBody.queries.length).toBeGreaterThan(0);
      queryId = appBody.queries[0].query_id;
    }, 30000);

    it("POST /api/v1/applications/:arn/query-response responds to query", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${submittedArn}/query-response`,
        payload: {
          queryId,
          responseMessage: "Here is the document.",
          userId: CITIZEN_USER_ID,
          updatedData: {},
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });

    it("GET /api/v1/applications/:arn after query response shows RESUBMITTED then PENDING_AT_CLERK", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(["RESUBMITTED", "PENDING_AT_CLERK"]).toContain(body.state_id);
    });
  });

  describe("7. Approve flow and output", () => {
    let submittedArn: string;
    let clerkTaskId: string;
    let srTaskId: string;
    let aoTaskId: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "Approve Test" }, property: { upn: "APP-001" } },
        },
      });
      const createBody = JSON.parse(createRes.payload);
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${createBody.arn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      submittedArn = JSON.parse(submitRes.payload).submittedArn;
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      const getBody = JSON.parse(getRes.payload);
      clerkTaskId = getBody.tasks[0].task_id;
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/assign`,
        payload: { userId: OFFICER_USER_ID },
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/actions`,
        payload: { action: "FORWARD", userId: OFFICER_USER_ID },
      });
      const get2 = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      srTaskId = JSON.parse(get2.payload).tasks[0].task_id;
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${srTaskId}/assign`,
        payload: { userId: SR_ASSISTANT_OFFICER_USER_ID },
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${srTaskId}/actions`,
        payload: { action: "FORWARD", userId: SR_ASSISTANT_OFFICER_USER_ID },
      });
      const get3 = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      aoTaskId = JSON.parse(get3.payload).tasks[0].task_id;
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${aoTaskId}/assign`,
        payload: { userId: ACCOUNT_OFFICER_USER_ID },
      });
    });

    it("POST /api/v1/tasks/:taskId/actions APPROVE disposes application and generates output", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${aoTaskId}/actions`,
        payload: { action: "APPROVE", userId: ACCOUNT_OFFICER_USER_ID, remarks: "Approved" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.newStateId).toBe("APPROVED");
    });

    it("GET /api/v1/applications/:arn shows disposed_at and disposal_type APPROVED", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.disposed_at).toBeDefined();
      expect(body.disposal_type).toBe("APPROVED");
    });

    it("GET /api/v1/applications/:arn/output returns output metadata", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}/output`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.arn).toBe(submittedArn);
      expect(body.output_id).toBeDefined();
    });

    it("GET /api/v1/applications/:arn/output/download returns file", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}/output/download`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/pdf/);
      expect(Buffer.isBuffer(res.rawPayload) || typeof res.payload === "string").toBe(true);
    });
  });

  describe("8. Reject flow", () => {
    let submittedArn: string;
    let clerkTaskId: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "Reject Test" }, property: { upn: "REJ-001" } },
        },
      });
      const createBody = JSON.parse(createRes.payload);
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${createBody.arn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      submittedArn = JSON.parse(submitRes.payload).submittedArn;
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      clerkTaskId = JSON.parse(getRes.payload).tasks[0].task_id;
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/assign`,
        payload: { userId: OFFICER_USER_ID },
      });
    });

    it("POST /api/v1/tasks/:taskId/actions REJECT disposes application", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/actions`,
        payload: { action: "REJECT", userId: OFFICER_USER_ID, remarks: "Incomplete" },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).newStateId).toBe("REJECTED");
    });

    it("GET /api/v1/applications/:arn/output after reject returns output (rejection letter)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}/output`,
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("9. Document upload", () => {
    let draftArn: string;
    let uploadedDocId: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: {},
        },
      });
      expect(createRes.statusCode).toBe(200);
      draftArn = JSON.parse(createRes.payload).arn;
    });

    it("POST /api/v1/documents/upload with multipart uploads document", async () => {
      const boundary = "----FormBoundary" + Date.now();
      const body =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="arn"\r\n\r\n${draftArn}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="docTypeId"\r\n\r\nidentity_proof\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="userId"\r\n\r\n${CITIZEN_USER_ID}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="test.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `test content\r\n` +
        `--${boundary}--\r\n`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/documents/upload",
        payload: body,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const doc = JSON.parse(res.payload);
      expect(doc.doc_id).toBeDefined();
      expect(doc.arn).toBe(draftArn);
      expect(doc.doc_type_id).toBe("identity_proof");
      uploadedDocId = doc.doc_id;
    });

    it("GET /api/v1/documents/:docId returns document metadata", async () => {
      expect(uploadedDocId).toBeDefined();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/documents/${uploadedDocId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.doc_id).toBe(uploadedDocId);
      expect(body.arn).toBe(draftArn);
      expect(body.doc_type_id).toBe("identity_proof");
    });
  });

  // M6: RBAC enforcement tests
  describe("10. RBAC and authorization", () => {
    let submittedArn: string;
    let clerkTaskId: string;

    beforeAll(async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: SERVICE_KEY,
          applicantUserId: CITIZEN_USER_ID,
          data: { applicant: { full_name: "RBAC Test" }, property: { upn: "RBAC-001" } },
        },
      });
      const createBody = JSON.parse(createRes.payload);
      const submitRes = await app.inject({
        method: "POST",
        url: `/api/v1/applications/${createBody.arn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      submittedArn = JSON.parse(submitRes.payload).submittedArn;
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/applications/${submittedArn}`,
      });
      clerkTaskId = JSON.parse(getRes.payload).tasks[0].task_id;
    });

    it("citizen cannot access officer inbox", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/inbox?userId=${CITIZEN_USER_ID}`,
        headers: citizenHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.tasks).toHaveLength(0);
    });

    it("officer without matching role cannot act on task", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${clerkTaskId}/assign`,
        headers: citizenHeaders(),
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error).toBe("FORBIDDEN");
    });

    it("validateOfficerCanActOnTask rejects invalid task ID", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/00000000-0000-0000-0000-000000000000/actions`,
        payload: { action: "FORWARD", userId: OFFICER_USER_ID },
      });
      expect([400, 403]).toContain(res.statusCode);
    });
  });

  describe("11. Error cases", () => {
    it("POST /api/v1/applications with invalid service returns 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        payload: {
          authorityId: AUTHORITY_ID,
          serviceKey: "nonexistent_service",
          applicantUserId: CITIZEN_USER_ID,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBeDefined();
    });

    it("GET /api/v1/applications/:arn with invalid ARN returns 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/applications/PUDA/9999/INVALID",
      });
      expect(res.statusCode).toBe(404);
    });

    it("POST /api/v1/tasks/:taskId/assign with invalid taskId returns 400 or 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/00000000-0000-0000-0000-000000000000/assign",
        payload: { userId: OFFICER_USER_ID },
      });
      // RBAC check catches this as 403 (TASK_NOT_FOUND in validateOfficerCanActOnTask)
      expect([400, 403]).toContain(res.statusCode);
      expect(JSON.parse(res.payload).error).toBeDefined();
    });
  });
});
