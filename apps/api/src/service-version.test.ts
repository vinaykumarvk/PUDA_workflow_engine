import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module before importing service-version
vi.mock("./db", () => ({
  query: vi.fn(),
}));

import { resolveActiveVersion } from "./service-version";
import { query } from "./db";

const mockQuery = vi.mocked(query);

describe("resolveActiveVersion", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });
  it("returns the version string when a published version exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ version: "1.0.0" }] });
    const result = await resolveActiveVersion("conveyance_deed");
    expect(result).toBe("1.0.0");
  });

  it("returns null when no published version exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await resolveActiveVersion("nonexistent_service");
    expect(result).toBeNull();
  });

  it("passes the service key as a query parameter", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ version: "2.0.0" }] });
    await resolveActiveVersion("test_service");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("service_key = $1"),
      ["test_service"]
    );
  });

  it("filters by effective_from <= NOW()", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ version: "1.0.0" }] });
    await resolveActiveVersion("test_service");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("effective_from IS NULL OR effective_from <= NOW()");
  });

  it("filters by effective_to > NOW()", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ version: "1.0.0" }] });
    await resolveActiveVersion("test_service");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("effective_to   IS NULL OR effective_to   >  NOW()");
  });

  it("filters by status = published", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ version: "1.0.0" }] });
    await resolveActiveVersion("test_service");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'published'");
  });

  it("orders by effective_from DESC NULLS LAST", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ version: "1.0.0" }] });
    await resolveActiveVersion("test_service");
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("ORDER BY effective_from DESC NULLS LAST");
  });

  it("uses custom client when provided", async () => {
    const customQuery = vi.fn().mockResolvedValueOnce({ rows: [{ version: "3.0.0" }] });
    const client = { query: customQuery };
    const result = await resolveActiveVersion("test_service", client);
    expect(result).toBe("3.0.0");
    expect(customQuery).toHaveBeenCalledTimes(1);
    // The default db.query should NOT have been called
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
