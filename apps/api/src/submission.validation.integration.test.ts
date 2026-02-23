import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";

const CITIZEN_USER_ID = "test-citizen-1";
const CITIZEN_LOGIN = "citizen1";
const CITIZEN_PASSWORD = "password123";
const AUTHORITY_ID = "PUDA";
const SERVICE_KEY = "registration_of_architect";

function createMultipartFormData(
  fields: Record<string, string>,
  file: { name: string; content: Buffer; filename: string; contentType: string }
) {
  const boundary = "----FormBoundary" + Date.now();
  let body = "";
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`;
  body += `Content-Type: ${file.contentType}\r\n\r\n`;

  const textPart = Buffer.from(body, "utf-8");
  const endBoundary = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
  return {
    payload: Buffer.concat([textPart, file.content, endBoundary]),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

describe("Submission validation integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let citizenToken = "";
  let dbReady = false;

  function citizenInject(opts: Parameters<typeof app.inject>[0]) {
    const request =
      typeof opts === "string" ? { method: "GET" as const, url: opts } : { ...opts };
    request.headers = {
      ...(request.headers || {}),
      authorization: `Bearer ${citizenToken}`,
    };
    return app.inject(request);
  }

  beforeAll(async () => {
    app = await buildApp(false);
    try {
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: CITIZEN_LOGIN, password: CITIZEN_PASSWORD },
      });
      if (loginRes.statusCode !== 200) {
        throw new Error(`LOGIN_FAILED_${loginRes.statusCode}`);
      }
      citizenToken = JSON.parse(loginRes.payload).token || "";
      dbReady = true;
    } catch (error: any) {
      dbReady = false;
      console.warn(
        `[SUBMIT-VALIDATION-IT] Skipping DB-backed tests: ${error?.message || "DB not ready"}`
      );
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  it("allows no-property service submit without submit-validation warning noise", async () => {
    const configRes = await app.inject({
      method: "GET",
      url: `/api/v1/config/services/${SERVICE_KEY}`,
    });
    expect(configRes.statusCode).toBe(200);
    const config = JSON.parse(configRes.payload);
    const mandatoryDocTypeIds: string[] = (config?.documents?.documentTypes || [])
      .filter((doc: any) => doc?.mandatory === true && typeof doc?.docTypeId === "string")
      .map((doc: any) => doc.docTypeId);
    expect(mandatoryDocTypeIds.length).toBeGreaterThan(0);

    const createRes = await citizenInject({
      method: "POST",
      url: "/api/v1/applications",
      payload: {
        authorityId: AUTHORITY_ID,
        serviceKey: SERVICE_KEY,
        applicantUserId: CITIZEN_USER_ID,
        data: {
          applicant: {
            full_name: "Architect Submit Validation",
            email: "architect.validation@test.gov.in",
            mobile: "9876543210",
          },
          coa: {
            certificate_number: `COA-IT-${Date.now()}`,
            valid_from: "2024-01-01",
            valid_till: "2029-01-01",
          },
          address: {
            permanent: {
              line1: "123 Main Street",
              state: "Punjab",
              district: "Mohali",
              pincode: "160055",
            },
            official: {
              same_as_permanent: true,
              line1: "123 Main Street",
              state: "Punjab",
              district: "Mohali",
              pincode: "160055",
            },
          },
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const draftArn = JSON.parse(createRes.payload).arn;
    expect(typeof draftArn).toBe("string");

    for (const docTypeId of mandatoryDocTypeIds) {
      const multipart = createMultipartFormData(
        { arn: draftArn, docTypeId, userId: CITIZEN_USER_ID },
        {
          name: "file",
          content: Buffer.from(`test-${docTypeId}`),
          filename: `${docTypeId}.pdf`,
          contentType: "application/pdf",
        }
      );
      const uploadRes = await citizenInject({
        method: "POST",
        url: "/api/v1/documents/upload",
        payload: multipart.payload,
        headers: multipart.headers,
      });
      expect(uploadRes.statusCode).toBe(200);
    }

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const submitRes = await citizenInject({
        method: "POST",
        url: `/api/v1/applications/${draftArn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      expect(submitRes.statusCode).toBe(200);

      const validationWarnCalls = warnSpy.mock.calls.filter((call) => {
        return String(call[0] || "").includes("[VALIDATION] Submit validation warnings");
      });
      expect(validationWarnCalls).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("blocks submit for services configured with enforce mode when validation fails", async () => {
    const createRes = await citizenInject({
      method: "POST",
      url: "/api/v1/applications",
      payload: {
        authorityId: AUTHORITY_ID,
        serviceKey: "no_due_certificate",
        applicantUserId: CITIZEN_USER_ID,
        data: {
          applicant: {
            full_name: "NDC Validation Enforce",
            email: "ndc.enforce@test.gov.in",
            mobile: "9876543210",
          },
          // property intentionally omitted to trigger validation failure
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const draftArn = JSON.parse(createRes.payload).arn;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const submitRes = await citizenInject({
        method: "POST",
        url: `/api/v1/applications/${draftArn}/submit`,
        payload: { userId: CITIZEN_USER_ID },
      });
      expect(submitRes.statusCode).toBe(400);
      const body = JSON.parse(submitRes.payload);
      expect(String(body.error || "")).toContain("VALIDATION_FAILED:");
      expect(String(body.error || "")).toContain("property");
    } finally {
      warnSpy.mockRestore();
    }
  });
});
