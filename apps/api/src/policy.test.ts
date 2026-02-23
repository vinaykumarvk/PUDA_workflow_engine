import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  authorizeApplicationRead,
  authorizeApplicationStaffMutation,
  authorizeAuthorityStaffAccess,
} from "./policy";
import { query } from "./db";

vi.mock("./db", () => ({
  query: vi.fn(),
}));

type MockRequest = Partial<FastifyRequest> & {
  authUser?: {
    userId: string;
    userType: "CITIZEN" | "OFFICER" | "ADMIN";
    postings?: Array<{ authority_id: string }>;
  };
};

const APP_CONTEXT = {
  arn: "PUDA/2026/000001",
  public_arn: "PUB-000001",
  authority_id: "PUDA",
  applicant_user_id: "citizen-1",
};

function setApplicationContext(found = true) {
  vi.mocked(query).mockResolvedValue({
    rows: found ? [APP_CONTEXT] : [],
  } as any);
}

function req(user?: MockRequest["authUser"]): FastifyRequest {
  return { authUser: user } as FastifyRequest;
}

describe("policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authorizeApplicationRead", () => {
    it("returns APPLICATION_NOT_FOUND when application does not exist", async () => {
      setApplicationContext(false);
      const access = await authorizeApplicationRead(req(), "MISSING-ARN");
      expect(access).toEqual({ authorized: false, reason: "APPLICATION_NOT_FOUND" });
    });

    it("returns AUTHENTICATION_REQUIRED when auth user is missing", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationRead(req(), APP_CONTEXT.arn);
      expect(access).toEqual({ authorized: false, reason: "AUTHENTICATION_REQUIRED" });
    });

    it("allows citizen to read their own application", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationRead(
        req({ userId: "citizen-1", userType: "CITIZEN" }),
        APP_CONTEXT.arn
      );
      expect(access.authorized).toBe(true);
      expect(access.application?.arn).toBe(APP_CONTEXT.arn);
    });

    it("forbids citizen from reading another citizen's application", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationRead(
        req({ userId: "citizen-2", userType: "CITIZEN" }),
        APP_CONTEXT.arn
      );
      expect(access).toEqual({ authorized: false, reason: "FORBIDDEN" });
    });

    it("allows officer with matching authority posting", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationRead(
        req({
          userId: "officer-1",
          userType: "OFFICER",
          postings: [{ authority_id: "PUDA" }],
        }),
        APP_CONTEXT.arn
      );
      expect(access.authorized).toBe(true);
    });

    it("forbids officer without matching authority posting", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationRead(
        req({
          userId: "officer-1",
          userType: "OFFICER",
          postings: [{ authority_id: "GMADA" }],
        }),
        APP_CONTEXT.arn
      );
      expect(access).toEqual({ authorized: false, reason: "FORBIDDEN" });
    });

    it("allows admin", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationRead(
        req({ userId: "admin-1", userType: "ADMIN" }),
        APP_CONTEXT.arn
      );
      expect(access.authorized).toBe(true);
    });

  });

  describe("authorizeApplicationStaffMutation", () => {
    it("allows admin", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationStaffMutation(
        req({ userId: "admin-1", userType: "ADMIN" }),
        APP_CONTEXT.arn
      );
      expect(access.authorized).toBe(true);
    });

    it("allows officer with matching authority posting", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationStaffMutation(
        req({
          userId: "officer-1",
          userType: "OFFICER",
          postings: [{ authority_id: "PUDA" }],
        }),
        APP_CONTEXT.arn
      );
      expect(access.authorized).toBe(true);
    });

    it("forbids citizen for staff mutation", async () => {
      setApplicationContext(true);
      const access = await authorizeApplicationStaffMutation(
        req({ userId: "citizen-1", userType: "CITIZEN" }),
        APP_CONTEXT.arn
      );
      expect(access).toEqual({ authorized: false, reason: "FORBIDDEN" });
    });
  });

  describe("authorizeAuthorityStaffAccess", () => {
    it("returns AUTHENTICATION_REQUIRED when auth user is missing", () => {
      const access = authorizeAuthorityStaffAccess(req(), "PUDA");
      expect(access).toEqual({ authorized: false, reason: "AUTHENTICATION_REQUIRED" });
    });

    it("allows admin for any authority", () => {
      const access = authorizeAuthorityStaffAccess(
        req({ userId: "admin-1", userType: "ADMIN" }),
        "ANY_AUTH"
      );
      expect(access.authorized).toBe(true);
    });

    it("allows officer for matching authority", () => {
      const access = authorizeAuthorityStaffAccess(
        req({
          userId: "officer-1",
          userType: "OFFICER",
          postings: [{ authority_id: "PUDA" }],
        }),
        "PUDA"
      );
      expect(access.authorized).toBe(true);
    });

    it("forbids officer for different authority", () => {
      const access = authorizeAuthorityStaffAccess(
        req({
          userId: "officer-1",
          userType: "OFFICER",
          postings: [{ authority_id: "GMADA" }],
        }),
        "PUDA"
      );
      expect(access).toEqual({ authorized: false, reason: "FORBIDDEN" });
    });

    it("forbids citizen", () => {
      const access = authorizeAuthorityStaffAccess(
        req({ userId: "citizen-1", userType: "CITIZEN" }),
        "PUDA"
      );
      expect(access).toEqual({ authorized: false, reason: "FORBIDDEN" });
    });
  });
});
