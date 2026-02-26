import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  query: vi.fn(),
  getClient: vi.fn(),
}));

import { query } from "./db";
import { exportApplicationsToCSV } from "./applications";

describe("exportApplicationsToCSV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escapes spreadsheet formula prefixes in exported cells", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          arn: "=2+2",
          service_key: "+calc",
          authority_id: "PUDA",
          applicant_name: "@danger",
          upn: "\tUPN-1",
          plot_no: "-plot-1",
          scheme_name: "Sector-1",
          state_id: "DRAFT",
          created_at: null,
          submitted_at: null,
          disposed_at: null,
          disposal_type: "",
        },
      ],
    } as any);

    const stream = await exportApplicationsToCSV();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf-8");
    const lines = csv.trimEnd().split("\n");
    const row = lines[1].split(",");

    expect(row[0]).toBe("'=2+2");
    expect(row[1]).toBe("'+calc");
    expect(row[3]).toBe("'@danger");
    expect(row[4]).toBe("'\tUPN-1");
    expect(row[5]).toBe("'-plot-1");
  });
});
