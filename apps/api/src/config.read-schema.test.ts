import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

process.env.RATE_LIMIT_MAX = "10000";

describe("Config read schema", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(false);
  });

  it("rejects unknown query parameters on /api/v1/config/services", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/config/services?unexpected=1",
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("INVALID_QUERY_PARAMS");
  });
});
