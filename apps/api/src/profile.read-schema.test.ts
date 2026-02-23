import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

process.env.RATE_LIMIT_MAX = "10000";

describe("Profile read schema", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let citizenToken = "";

  beforeAll(async () => {
    app = await buildApp(false);
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "citizen1", password: "password123" },
    });
    expect(loginRes.statusCode).toBe(200);
    citizenToken = (JSON.parse(loginRes.payload) as { token?: string }).token || "";
  });

  it("rejects unknown query parameters on /api/v1/profile/me", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/profile/me?userId=test-citizen-1&unexpected=1",
      headers: { authorization: `Bearer ${citizenToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("INVALID_QUERY_PARAMS");
  });
});
