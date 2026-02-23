import { describe, expect, it } from "vitest";
import { validateForSubmission } from "@puda/shared";

describe("submit validation compatibility", () => {
  it("accepts legacy applicant/property payload used by current service packs", () => {
    const result = validateForSubmission({
      applicant: {
        full_name: "Legacy Applicant",
        mobile: "9876543210",
        email: "legacy@example.com",
      },
      property: {
        upn: "UPN-001",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects submit payload with missing applicant name", () => {
    const result = validateForSubmission({
      applicant: {
        mobile: "9876543210",
      },
      property: {
        upn: "UPN-001",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects submit payload with invalid applicant mobile", () => {
    const result = validateForSubmission({
      applicant: {
        full_name: "Legacy Applicant",
        mobile: "ABC123",
      },
      property: {
        upn: "UPN-001",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects submit payload when property lacks identifiable keys", () => {
    const result = validateForSubmission({
      applicant: {
        full_name: "Legacy Applicant",
        mobile: "9876543210",
      },
      property: {},
    });

    expect(result.success).toBe(false);
  });

  it("allows missing property when service config marks property as optional", () => {
    const result = validateForSubmission(
      {
        applicant: {
          full_name: "Legacy Applicant",
          mobile: "9876543210",
        },
      },
      { requireProperty: false }
    );

    expect(result.success).toBe(true);
  });

  it("still rejects missing property when service config requires it", () => {
    const result = validateForSubmission(
      {
        applicant: {
          full_name: "Legacy Applicant",
          mobile: "9876543210",
        },
      },
      { requireProperty: true }
    );

    expect(result.success).toBe(false);
  });
});
