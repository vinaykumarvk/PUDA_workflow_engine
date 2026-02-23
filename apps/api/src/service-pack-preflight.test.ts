import { promises as fs } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";

process.env.RATE_LIMIT_MAX = "10000";

describe("Service pack startup preflight", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildApp fails when service.yaml metadata is invalid", async () => {
    const originalReadFile = fs.readFile.bind(fs);
    const targetYamlPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "service-packs",
      "no_due_certificate",
      "service.yaml"
    );

    vi.spyOn(fs, "readFile").mockImplementation(async (filePath, options) => {
      const resolvedPath = path.resolve(String(filePath));
      if (resolvedPath === targetYamlPath) {
        return `
serviceKey: no_due_certificate
displayName: Issue of No Due Certificate
category: PROPERTY_SERVICES
description: Invalid config used for preflight test
applicableAuthorities:
  - PUDA
sla:
  totalDays: 5
  calendarType: WORKING_DAYS
  workingCalendar: PUNJAB_GOVT
applicantTypes:
  - INDIVIDUAL
physicalDocumentRequired: false
physicalVerificationRequired: false
submissionValidation:
  propertyRequired: true
  enforcementMode: enforce
unexpectedKey: true
`;
      }
      return originalReadFile(filePath, options as any);
    });

    await expect(buildApp(false)).rejects.toThrow(/SERVICE_PACK_PREFLIGHT_FAILED/);
    await expect(buildApp(false)).rejects.toThrow(/unexpectedKey/);
  });
});
