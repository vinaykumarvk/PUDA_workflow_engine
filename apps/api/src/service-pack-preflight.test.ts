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

  it("buildApp fails when form.json has unsupported field type", async () => {
    const originalReadFile = fs.readFile.bind(fs);
    const targetFormPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "service-packs",
      "no_due_certificate",
      "form.json"
    );

    vi.spyOn(fs, "readFile").mockImplementation(async (filePath, options) => {
      const resolvedPath = path.resolve(String(filePath));
      if (resolvedPath === targetFormPath) {
        return JSON.stringify({
          formId: "FORM_TEST",
          version: "1.0.0",
          pages: [{
            pageId: "PAGE_1",
            title: "Test",
            sections: [{
              sectionId: "SEC_1",
              title: "Test Section",
              fields: [
                { key: "name", label: "Name", type: "string" },
                { key: "notes", label: "Notes", type: "richtext" },
              ],
            }],
          }],
        });
      }
      return originalReadFile(filePath, options as any);
    });

    await expect(buildApp(false)).rejects.toThrow(/SERVICE_PACK_PREFLIGHT_FAILED/);
    await expect(buildApp(false)).rejects.toThrow(/unsupported type "richtext"/);
  });

  it("buildApp succeeds with all valid field types", async () => {
    // No mocks — validates the real service packs in the repo.
    // If this fails, a form.json was committed with an unsupported field type.
    const app = await buildApp(false);
    expect(app).toBeDefined();
    await app.close();
  });
});
