import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("Observability metrics endpoint", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const originalRateLimitMax = process.env.RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = "10000";
    app = await buildApp(false);
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_MAX = originalRateLimitMax;
    await app.close();
  });

  it("exposes Prometheus metrics without requiring bearer auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["content-type"] || "")).toContain("text/plain");
    expect(response.payload).toContain("puda_api_http_requests_total");
    expect(response.payload).toContain("puda_api_http_request_duration_seconds");
    expect(response.payload).toContain("puda_api_db_pool_waiting_clients");
  });
});
