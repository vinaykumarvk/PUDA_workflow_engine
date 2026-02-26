import { FastifyInstance } from "fastify";
import path from "path";
import * as complaints from "../complaints";
import { getAuthUserId, getAuthUserType, send400, send403, send404 } from "../errors";

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || "upload");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255) || "upload";
}

const VIOLATION_TYPES = [
  "UNAUTHORIZED_CONSTRUCTION",
  "PLAN_DEVIATION",
  "ENCROACHMENT",
  "HEIGHT_VIOLATION",
  "SETBACK_VIOLATION",
  "CHANGE_OF_USE",
  "UNAUTHORIZED_COLONY",
  "OTHER",
];

export async function registerComplaintRoutes(app: FastifyInstance) {
  // Create a new complaint
  app.post(
    "/api/v1/complaints",
    {
      schema: {
        body: {
          type: "object",
          required: ["violationType", "locationAddress", "subject", "description"],
          additionalProperties: false,
          properties: {
            violationType: { type: "string", enum: VIOLATION_TYPES },
            locationAddress: { type: "string", minLength: 1 },
            locationLocality: { type: "string" },
            locationCity: { type: "string" },
            locationDistrict: { type: "string" },
            locationPincode: { type: "string" },
            subject: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string", minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const body = request.body as {
        violationType: string;
        locationAddress: string;
        locationLocality?: string;
        locationCity?: string;
        locationDistrict?: string;
        locationPincode?: string;
        subject: string;
        description: string;
      };

      try {
        const complaint = await complaints.createComplaint(userId, body);
        reply.code(201);
        return complaint;
      } catch (error: any) {
        return send400(reply, error.message);
      }
    }
  );

  // List citizen's complaints
  app.get(
    "/api/v1/complaints",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            offset: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const qs = request.query as { status?: string; limit?: number; offset?: number };
      const result = await complaints.getComplaintsByUser(userId, qs);
      return result;
    }
  );

  // Get single complaint by complaint number
  app.get(
    "/api/v1/complaints/:complaintNumber",
    {
      schema: {
        params: {
          type: "object",
          required: ["complaintNumber"],
          additionalProperties: false,
          properties: {
            complaintNumber: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const params = request.params as { complaintNumber: string };
      const complaint = await complaints.getComplaintByNumber(params.complaintNumber);
      if (!complaint) return send404(reply, "COMPLAINT_NOT_FOUND");
      if (complaint.user_id !== userId) return send403(reply, "FORBIDDEN");

      const evidence = await complaints.getComplaintEvidence(complaint.complaint_id);
      return { ...complaint, evidence };
    }
  );

  // Upload evidence photo
  app.post(
    "/api/v1/complaints/:complaintNumber/evidence",
    {
      config: { skipStrictMutationBodySchema: true },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const params = request.params as { complaintNumber: string };
      const complaint = await complaints.getComplaintByNumber(params.complaintNumber);
      if (!complaint) return send404(reply, "COMPLAINT_NOT_FOUND");
      if (complaint.user_id !== userId) return send403(reply, "FORBIDDEN");

      const data = await request.file();
      if (!data) return send400(reply, "NO_FILE");

      const safeFilename = sanitizeFilename(data.filename);

      try {
        const evidence = await complaints.addComplaintEvidence(
          complaint.complaint_id,
          userId,
          safeFilename,
          data.mimetype,
          data.file
        );
        reply.code(201);
        return evidence;
      } catch (error: any) {
        if (error.message === "INVALID_FILE_TYPE") {
          return send400(reply, "INVALID_FILE_TYPE", "Only JPEG and PNG images are allowed.");
        }
        if (error.message === "FILE_TOO_LARGE") {
          return send400(reply, "FILE_TOO_LARGE", "Maximum file size is 5MB.");
        }
        if (error.message === "MAX_EVIDENCE_REACHED") {
          return send400(reply, "MAX_EVIDENCE_REACHED", "Maximum 5 evidence files per complaint.");
        }
        if (error.message === "MIME_MISMATCH") {
          return send400(reply, "MIME_MISMATCH", "File content does not match declared MIME type.");
        }
        return send400(reply, error.message);
      }
    }
  );

  // Download evidence file
  app.get(
    "/api/v1/complaints/:complaintNumber/evidence/:evidenceId/file",
    {
      schema: {
        params: {
          type: "object",
          required: ["complaintNumber", "evidenceId"],
          additionalProperties: false,
          properties: {
            complaintNumber: { type: "string", minLength: 1 },
            evidenceId: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const params = request.params as { complaintNumber: string; evidenceId: string };
      const complaint = await complaints.getComplaintByNumber(params.complaintNumber);
      if (!complaint) return send404(reply, "COMPLAINT_NOT_FOUND");
      if (complaint.user_id !== userId) return send403(reply, "FORBIDDEN");

      const file = await complaints.getEvidenceFile(complaint.complaint_id, params.evidenceId);
      if (!file) return send404(reply, "EVIDENCE_NOT_FOUND");

      reply.type(file.mimeType);
      return file.buffer;
    }
  );

  // ── Officer Routes ──

  // List all complaints (officer only)
  app.get(
    "/api/v1/officer/complaints",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
            violationType: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            offset: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const userType = getAuthUserType(request);
      if (userType !== "OFFICER") return send403(reply, "OFFICER_ONLY");

      const qs = request.query as { status?: string; violationType?: string; limit?: number; offset?: number };
      return complaints.getAllComplaints(qs);
    }
  );

  // Get single complaint detail (officer, no ownership check)
  app.get(
    "/api/v1/officer/complaints/:complaintNumber",
    {
      schema: {
        params: {
          type: "object",
          required: ["complaintNumber"],
          additionalProperties: false,
          properties: {
            complaintNumber: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const userType = getAuthUserType(request);
      if (userType !== "OFFICER") return send403(reply, "OFFICER_ONLY");

      const params = request.params as { complaintNumber: string };
      const complaint = await complaints.getComplaintByNumber(params.complaintNumber);
      if (!complaint) return send404(reply, "COMPLAINT_NOT_FOUND");

      const evidence = await complaints.getComplaintEvidence(complaint.complaint_id);
      return { ...complaint, evidence };
    }
  );

  // Update complaint status (officer only)
  app.patch(
    "/api/v1/officer/complaints/:complaintNumber/status",
    {
      schema: {
        params: {
          type: "object",
          required: ["complaintNumber"],
          additionalProperties: false,
          properties: {
            complaintNumber: { type: "string", minLength: 1 },
          },
        },
        body: {
          type: "object",
          required: ["status"],
          additionalProperties: false,
          properties: {
            status: {
              type: "string",
              enum: [
                "UNDER_REVIEW",
                "INSPECTION_ORDERED",
                "ACTION_TAKEN",
                "RESOLVED",
                "CLOSED",
                "REJECTED",
              ],
            },
            officerRemarks: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const userType = getAuthUserType(request);
      if (userType !== "OFFICER") return send403(reply, "OFFICER_ONLY");

      const params = request.params as { complaintNumber: string };
      const body = request.body as { status: string; officerRemarks?: string };

      const complaint = await complaints.getComplaintByNumber(params.complaintNumber);
      if (!complaint) return send404(reply, "COMPLAINT_NOT_FOUND");

      try {
        const updated = await complaints.updateComplaintStatus(
          complaint.complaint_id,
          body.status,
          body.officerRemarks
        );
        return updated;
      } catch (error: any) {
        if (error.message === "INVALID_STATUS_TRANSITION") {
          return send400(
            reply,
            "INVALID_STATUS_TRANSITION",
            `Cannot transition from ${complaint.status} to ${body.status}`
          );
        }
        return send400(reply, error.message);
      }
    }
  );

  // Officer can view evidence files without ownership check
  app.get(
    "/api/v1/officer/complaints/:complaintNumber/evidence/:evidenceId/file",
    {
      schema: {
        params: {
          type: "object",
          required: ["complaintNumber", "evidenceId"],
          additionalProperties: false,
          properties: {
            complaintNumber: { type: "string", minLength: 1 },
            evidenceId: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const userType = getAuthUserType(request);
      if (userType !== "OFFICER") return send403(reply, "OFFICER_ONLY");

      const params = request.params as { complaintNumber: string; evidenceId: string };
      const complaint = await complaints.getComplaintByNumber(params.complaintNumber);
      if (!complaint) return send404(reply, "COMPLAINT_NOT_FOUND");

      const file = await complaints.getEvidenceFile(complaint.complaint_id, params.evidenceId);
      if (!file) return send404(reply, "EVIDENCE_NOT_FOUND");

      reply.type(file.mimeType);
      return file.buffer;
    }
  );
}
