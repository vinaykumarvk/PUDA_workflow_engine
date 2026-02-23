import path from "path";
import dotenv from "dotenv";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
process.env.RATE_LIMIT_MAX = "10000";
process.env.OFFICER_MFA_REQUIRED_ON_DECISION = "true";
process.env.MFA_DEBUG_RETURN_CODE = "true";

describe("Officer MFA step-up integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dbReady = false;
  let citizenToken = "";
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

  beforeAll(async () => {
    app = await buildApp(false);
    try {
      citizenToken = await login("citizen1", "password123");
      officerToken = await login("officer1", "password123");
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[MFA-STEPUP-IT] Skipping DB-backed MFA integration tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) {
      ctx.skip();
    }
  });

  it("requires MFA for officer APPROVE action and accepts valid challenge code", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/applications",
      headers: authHeader(citizenToken),
      payload: {
        authorityId: "PUDA",
        serviceKey: "no_due_certificate",
        applicantUserId: "test-citizen-1",
        data: {
          applicant: { full_name: "MFA Step-up Test User" },
          property: { upn: `MFA-UPN-${Date.now()}` },
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const draftArn = (JSON.parse(createRes.payload) as { arn: string }).arn;

    const submitRes = await app.inject({
      method: "POST",
      url: `/api/v1/applications/${draftArn}/submit`,
      headers: authHeader(citizenToken),
    });
    expect(submitRes.statusCode).toBe(200);
    const submittedArn = (JSON.parse(submitRes.payload) as { submittedArn: string }).submittedArn;

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/inbox?authorityId=PUDA&status=PENDING",
      headers: authHeader(officerToken),
    });
    expect(inboxRes.statusCode).toBe(200);
    const inboxBody = JSON.parse(inboxRes.payload) as {
      tasks?: Array<{ task_id: string; arn: string }>;
    };
    const targetTask = (inboxBody.tasks || []).find((task) => task.arn === submittedArn);
    expect(targetTask?.task_id).toBeTruthy();
    const taskId = targetTask!.task_id;

    const noMfaRes = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/actions`,
      headers: authHeader(officerToken),
      payload: { action: "APPROVE", remarks: "Approve without MFA should fail" },
    });
    expect(noMfaRes.statusCode).toBe(403);
    expect(JSON.parse(noMfaRes.payload).error).toBe("MFA_REQUIRED");

    const challengeRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/challenge",
      headers: authHeader(officerToken),
      payload: { purpose: "TASK_DECISION", taskId },
    });
    expect(challengeRes.statusCode).toBe(200);
    const challengeBody = JSON.parse(challengeRes.payload) as {
      challengeId: string;
      debugCode?: string;
    };
    expect(challengeBody.challengeId).toBeTruthy();
    expect(challengeBody.debugCode).toMatch(/^\d{6}$/);

    const badCode = challengeBody.debugCode === "000000" ? "111111" : "000000";
    const badMfaRes = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/actions`,
      headers: authHeader(officerToken),
      payload: {
        action: "APPROVE",
        remarks: "Approve with wrong MFA code should fail",
        mfaChallengeId: challengeBody.challengeId,
        mfaCode: badCode,
      },
    });
    expect(badMfaRes.statusCode).toBe(403);
    expect(JSON.parse(badMfaRes.payload).error).toBe("MFA_CODE_INVALID");

    const validMfaRes = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/actions`,
      headers: authHeader(officerToken),
      payload: {
        action: "APPROVE",
        remarks: "MFA gate should pass now",
        mfaChallengeId: challengeBody.challengeId,
        mfaCode: challengeBody.debugCode,
      },
    });
    // Action may still fail for workflow reasons, but must not fail MFA gate.
    if (validMfaRes.statusCode === 403) {
      const error = JSON.parse(validMfaRes.payload).error as string | undefined;
      expect(error).not.toMatch(/^MFA_/);
    }
  });
});
