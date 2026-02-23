import { describe, expect, it } from "vitest";
import { parseServiceMetadataYaml, ServiceMetadataValidationError } from "./service-metadata";

const VALID_SERVICE_YAML = `
serviceKey: no_due_certificate
displayName: Issue of No Due Certificate
category: PROPERTY_SERVICES
description: Issue of No Due Certificate for property dues clearance
applicableAuthorities:
  - PUDA
  - GMADA
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
`;

describe("service metadata validation", () => {
  it("accepts valid service.yaml", () => {
    const parsed = parseServiceMetadataYaml(VALID_SERVICE_YAML, "service.yaml", {
      expectedServiceKey: "no_due_certificate",
    });
    expect(parsed.serviceKey).toBe("no_due_certificate");
    expect(parsed.submissionValidation.enforcementMode).toBe("enforce");
  });

  it("rejects unknown top-level keys", () => {
    const invalidYaml = `${VALID_SERVICE_YAML}\nunknownTopLevel: true\n`;
    expect(() => parseServiceMetadataYaml(invalidYaml, "service.yaml")).toThrow(
      ServiceMetadataValidationError
    );
    expect(() => parseServiceMetadataYaml(invalidYaml, "service.yaml")).toThrow(
      /unknownTopLevel/
    );
  });

  it("rejects missing required fields", () => {
    const invalidYaml = VALID_SERVICE_YAML.replace(
      /submissionValidation:[\s\S]*$/,
      ""
    );
    expect(() => parseServiceMetadataYaml(invalidYaml, "service.yaml")).toThrow(
      /missing required keys: submissionValidation/
    );
  });

  it("rejects unknown submissionValidation keys", () => {
    const invalidYaml = VALID_SERVICE_YAML.replace(
      "enforcementMode: enforce",
      "enforcementMode: enforce\n  unknownNested: true"
    );
    expect(() => parseServiceMetadataYaml(invalidYaml, "service.yaml")).toThrow(
      /submissionValidation has unknown keys: unknownNested/
    );
  });

  it("rejects unsupported enforcementMode", () => {
    const invalidYaml = VALID_SERVICE_YAML.replace("enforcementMode: enforce", "enforcementMode: soft");
    expect(() => parseServiceMetadataYaml(invalidYaml, "service.yaml")).toThrow(
      /enforcementMode must be one of: warn, enforce/
    );
  });

  it("rejects serviceKey-directory mismatch", () => {
    expect(() =>
      parseServiceMetadataYaml(VALID_SERVICE_YAML, "service.yaml", {
        expectedServiceKey: "registration_of_architect",
      })
    ).toThrow(/must match directory name/);
  });
});
