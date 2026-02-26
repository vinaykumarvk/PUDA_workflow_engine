/**
 * Contract tests for /api/v1/ai/summarize-timeline.
 * Validates that both old and new payload shapes are accepted by the schema.
 * Does not require a database or OpenAI key — tests schema validation only.
 */
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "./app";

describe("AI summarize-timeline contract", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("accepts new payload shape: { arn }", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize-timeline",
      headers: { "Content-Type": "application/json" },
      payload: { arn: "PUDA/NDC/2025/000001" },
    });
    // Without auth the request will fail with 401 or 403, but NOT 400 (schema).
    // If AI is not configured it returns 503. Either way, not a schema rejection.
    expect(res.statusCode).not.toBe(400);
  });

  it("accepts legacy payload shape: { timeline, currentState, serviceKey }", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize-timeline",
      headers: { "Content-Type": "application/json" },
      payload: {
        timeline: [
          { event_type: "SUBMITTED", created_at: "2025-06-01T00:00:00Z" },
        ],
        currentState: "SUBMITTED",
        serviceKey: "no_due_certificate",
      },
    });
    // Should not be rejected as schema validation error
    expect(res.statusCode).not.toBe(400);
  });

  it("rejects invalid payload (missing required fields)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize-timeline",
      headers: { "Content-Type": "application/json" },
      payload: { unknownField: "value" },
    });
    // Should be rejected by schema validation (400)
    expect(res.statusCode).toBe(400);
  });

  it("rejects empty arn string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize-timeline",
      headers: { "Content-Type": "application/json" },
      payload: { arn: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects mixed payload (arn + timeline together)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize-timeline",
      headers: { "Content-Type": "application/json" },
      payload: {
        arn: "PUDA/NDC/2025/000001",
        timeline: [],
        currentState: "SUBMITTED",
        serviceKey: "no_due_certificate",
      },
    });
    // additionalProperties: false on both branches should reject
    expect(res.statusCode).toBe(400);
  });
});
