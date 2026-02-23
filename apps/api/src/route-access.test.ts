import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireApplicationReadAccess,
  requireApplicationStaffMutationAccess,
  requireAuthorityStaffAccess,
  requireCitizenOwnedApplicationAccess,
  requireValidAuthorityId,
} from "./route-access";
import {
  authorizeApplicationRead,
  authorizeApplicationStaffMutation,
  authorizeAuthorityStaffAccess,
  authorizeCitizenOwnedApplication,
} from "./policy";
import { query } from "./db";
import { send400, send401, send403, send404 } from "./errors";

vi.mock("./policy", () => ({
  authorizeApplicationRead: vi.fn(),
  authorizeApplicationStaffMutation: vi.fn(),
  authorizeAuthorityStaffAccess: vi.fn(),
  authorizeCitizenOwnedApplication: vi.fn(),
}));

vi.mock("./errors", () => ({
  send400: vi.fn((_reply: any, error: string, message?: string) => ({ error, message, statusCode: 400 })),
  send401: vi.fn((_reply: any, error: string) => ({ error, statusCode: 401 })),
  send403: vi.fn((_reply: any, error: string, message?: string) => ({ error, message, statusCode: 403 })),
  send404: vi.fn((_reply: any, error: string) => ({ error, statusCode: 404 })),
}));

vi.mock("./db", () => ({
  query: vi.fn(),
}));

describe("route-access helpers", () => {
  const request = {} as any;
  const reply = { send: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    reply.send.mockClear();
  });

  describe("requireApplicationReadAccess", () => {
    it("returns internal arn when authorized", async () => {
      vi.mocked(authorizeApplicationRead).mockResolvedValue({
        authorized: true,
        application: { arn: "PUDA/2026/000001", public_arn: null, authority_id: "PUDA", applicant_user_id: "u1" },
      } as any);

      const arn = await requireApplicationReadAccess(request, reply, "PUB-1", "forbidden");
      expect(arn).toBe("PUDA/2026/000001");
      expect(send401).not.toHaveBeenCalled();
      expect(send403).not.toHaveBeenCalled();
      expect(send404).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it("maps APPLICATION_NOT_FOUND to 404", async () => {
      vi.mocked(authorizeApplicationRead).mockResolvedValue({
        authorized: false,
        reason: "APPLICATION_NOT_FOUND",
      } as any);

      const arn = await requireApplicationReadAccess(request, reply, "PUB-1", "forbidden");
      expect(arn).toBeNull();
      expect(send404).toHaveBeenCalledWith(reply, "APPLICATION_NOT_FOUND");
      expect(reply.send).toHaveBeenCalledWith({ error: "APPLICATION_NOT_FOUND", statusCode: 404 });
    });

    it("maps AUTHENTICATION_REQUIRED to 401", async () => {
      vi.mocked(authorizeApplicationRead).mockResolvedValue({
        authorized: false,
        reason: "AUTHENTICATION_REQUIRED",
      } as any);

      const arn = await requireApplicationReadAccess(request, reply, "PUB-1", "forbidden");
      expect(arn).toBeNull();
      expect(send401).toHaveBeenCalledWith(reply, "AUTHENTICATION_REQUIRED");
      expect(reply.send).toHaveBeenCalledWith({ error: "AUTHENTICATION_REQUIRED", statusCode: 401 });
    });

    it("maps FORBIDDEN to 403 with message", async () => {
      vi.mocked(authorizeApplicationRead).mockResolvedValue({
        authorized: false,
        reason: "FORBIDDEN",
      } as any);

      const arn = await requireApplicationReadAccess(request, reply, "PUB-1", "No access");
      expect(arn).toBeNull();
      expect(send403).toHaveBeenCalledWith(reply, "FORBIDDEN", "No access");
      expect(reply.send).toHaveBeenCalledWith({
        error: "FORBIDDEN",
        message: "No access",
        statusCode: 403,
      });
    });
  });

  describe("requireApplicationStaffMutationAccess", () => {
    it("delegates to staff mutation policy and returns arn", async () => {
      vi.mocked(authorizeApplicationStaffMutation).mockResolvedValue({
        authorized: true,
        application: { arn: "PUDA/2026/000002", public_arn: null, authority_id: "PUDA", applicant_user_id: "u2" },
      } as any);

      const arn = await requireApplicationStaffMutationAccess(request, reply, "ARN-2", "No mutate");
      expect(arn).toBe("PUDA/2026/000002");
    });
  });

  describe("requireCitizenOwnedApplicationAccess", () => {
    it("delegates to citizen-owned policy and returns arn", async () => {
      vi.mocked(authorizeCitizenOwnedApplication).mockResolvedValue({
        authorized: true,
        application: { arn: "PUDA/2026/000003", public_arn: null, authority_id: "PUDA", applicant_user_id: "u3" },
      } as any);

      const arn = await requireCitizenOwnedApplicationAccess(request, reply, "ARN-3", "No owner access");
      expect(arn).toBe("PUDA/2026/000003");
    });
  });

  describe("requireAuthorityStaffAccess", () => {
    it("returns true when authority access is granted", () => {
      vi.mocked(authorizeAuthorityStaffAccess).mockReturnValue({ authorized: true } as any);
      const ok = requireAuthorityStaffAccess(request, reply, "PUDA", "No authority access");
      expect(ok).toBe(true);
      expect(reply.send).not.toHaveBeenCalled();
    });

    it("maps auth missing to 401 and returns false", () => {
      vi.mocked(authorizeAuthorityStaffAccess).mockReturnValue({
        authorized: false,
        reason: "AUTHENTICATION_REQUIRED",
      } as any);
      const ok = requireAuthorityStaffAccess(request, reply, "PUDA", "No authority access");
      expect(ok).toBe(false);
      expect(send401).toHaveBeenCalledWith(reply, "AUTHENTICATION_REQUIRED");
      expect(reply.send).toHaveBeenCalledWith({ error: "AUTHENTICATION_REQUIRED", statusCode: 401 });
    });

    it("maps forbidden to 403 and returns false", () => {
      vi.mocked(authorizeAuthorityStaffAccess).mockReturnValue({
        authorized: false,
        reason: "FORBIDDEN",
      } as any);
      const ok = requireAuthorityStaffAccess(request, reply, "PUDA", "No authority access");
      expect(ok).toBe(false);
      expect(send403).toHaveBeenCalledWith(reply, "FORBIDDEN", "No authority access");
      expect(reply.send).toHaveBeenCalledWith({
        error: "FORBIDDEN",
        message: "No authority access",
        statusCode: 403,
      });
    });
  });

  describe("requireValidAuthorityId", () => {
    it("returns true when authorityId is undefined", async () => {
      const ok = await requireValidAuthorityId(reply, undefined);
      expect(ok).toBe(true);
      expect(query).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid authorityId format", async () => {
      const ok = await requireValidAuthorityId(reply, "gmada");
      expect(ok).toBe(false);
      expect(query).not.toHaveBeenCalled();
      expect(send400).toHaveBeenCalledWith(
        reply,
        "INVALID_AUTHORITY_ID",
        "authorityId must match pattern ^[A-Z][A-Z0-9_]{1,31}$"
      );
      expect(reply.send).toHaveBeenCalledWith({
        error: "INVALID_AUTHORITY_ID",
        message: "authorityId must match pattern ^[A-Z][A-Z0-9_]{1,31}$",
        statusCode: 400,
      });
    });

    it("returns 400 for unknown authorityId", async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] } as any);
      const ok = await requireValidAuthorityId(reply, "UNKNOWN_AUTHORITY");
      expect(ok).toBe(false);
      expect(query).toHaveBeenCalledWith(
        "SELECT 1 FROM authority WHERE authority_id = $1 LIMIT 1",
        ["UNKNOWN_AUTHORITY"]
      );
      expect(send400).toHaveBeenCalledWith(reply, "INVALID_AUTHORITY_ID", "Unknown authorityId");
      expect(reply.send).toHaveBeenCalledWith({
        error: "INVALID_AUTHORITY_ID",
        message: "Unknown authorityId",
        statusCode: 400,
      });
    });

    it("returns true when authorityId exists", async () => {
      vi.mocked(query).mockResolvedValue({ rows: [{ "?column?": 1 }] } as any);
      const ok = await requireValidAuthorityId(reply, "PUDA");
      expect(ok).toBe(true);
      expect(query).toHaveBeenCalledWith(
        "SELECT 1 FROM authority WHERE authority_id = $1 LIMIT 1",
        ["PUDA"]
      );
      expect(reply.send).not.toHaveBeenCalled();
    });
  });
});
