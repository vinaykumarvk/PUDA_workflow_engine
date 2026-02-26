import { FastifyInstance } from "fastify";
import path from "path";
import * as documents from "../documents";
import * as applications from "../applications";
import { getAuthUserId, send400, send403, send404 } from "../errors";
import { requireCitizenOwnedApplicationAccess } from "../route-access";

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || "upload");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255) || "upload";
}

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const citizenDocIdParamsSchema = {
  params: {
    type: "object",
    required: ["citizenDocId"],
    additionalProperties: false,
    properties: {
      citizenDocId: { type: "string", minLength: 1 },
    },
  },
};

const docTypeIdParamsSchema = {
  params: {
    type: "object",
    required: ["docTypeId"],
    additionalProperties: false,
    properties: {
      docTypeId: { type: "string", minLength: 1 },
    },
  },
};

const reuseBodySchema = {
  body: {
    type: "object",
    required: ["citizenDocId", "arn", "docTypeId"],
    additionalProperties: false,
    properties: {
      citizenDocId: { type: "string", minLength: 1 },
      arn: { type: "string", minLength: 1 },
      docTypeId: { type: "string", minLength: 1 },
    },
  },
};

export async function registerCitizenDocumentRoutes(app: FastifyInstance) {
  // List all citizen's locker documents (current versions, with linked app info)
  app.get(
    "/api/v1/citizens/me/documents",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const docs = await documents.getCitizenDocuments(userId);
      // Compute summary stats based on document lifecycle status
      let uploaded = 0;
      let issued = 0;
      let valid = 0;
      let expired = 0;
      let mismatch = 0;
      let cancelled = 0;
      let expiringSoon = 0;
      const now = new Date();
      for (const doc of docs) {
        if (doc.origin === "issued") issued++;
        else uploaded++;
        const cs = doc.computed_status;
        if (cs === "VALID") valid++;
        else if (cs === "EXPIRED") expired++;
        else if (cs === "MISMATCH") mismatch++;
        else if (cs === "CANCELLED") cancelled++;
        if (doc.valid_until && doc.computed_status === "VALID") {
          const daysLeft = Math.ceil((new Date(doc.valid_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 90) expiringSoon++;
        }
      }
      return {
        documents: docs,
        summary: { total: docs.length, uploaded, issued, valid, expired, mismatch, cancelled, expiringSoon },
      };
    }
  );

  // Version history for a doc type
  app.get(
    "/api/v1/citizens/me/documents/:docTypeId/versions",
    { schema: docTypeIdParamsSchema },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const params = request.params as { docTypeId: string };
      const versions = await documents.getCitizenDocVersions(userId, params.docTypeId);
      return { versions };
    }
  );

  // Upload to locker (no application context)
  app.post(
    "/api/v1/citizens/me/documents/upload",
    { config: { skipStrictMutationBodySchema: true } },
    async (request, reply) => {
      const userId = request.authUser?.userId || getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const data = await request.file();
      if (!data) return send400(reply, "NO_FILE");

      const fields = (data as any).fields as Record<string, { value: string }> | undefined;
      const docTypeId = fields?.docTypeId?.value;
      if (!docTypeId) return send400(reply, "MISSING_DOC_TYPE_ID");
      const validFrom = fields?.validFrom?.value || undefined;
      const validUntil = fields?.validUntil?.value || undefined;

      if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
        return send400(reply, "INVALID_FILE_TYPE", `Only PDF, JPEG, and PNG files are allowed. Received: ${data.mimetype}`);
      }
      const ext = (data.filename || "").toLowerCase().split(".").pop();
      if (ext && !ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
        return send400(reply, "INVALID_FILE_EXTENSION", `File extension .${ext} is not allowed.`);
      }

      const safeFilename = sanitizeFilename(data.filename);

      try {
        const citizenDoc = await documents.uploadCitizenDocument(
          userId, docTypeId, safeFilename, data.mimetype, data.file,
          { validFrom, validUntil }
        );
        return citizenDoc;
      } catch (error: any) {
        return send400(reply, error.message);
      }
    }
  );

  // Attach existing locker doc to an application
  app.post(
    "/api/v1/citizens/me/documents/reuse",
    { schema: reuseBodySchema },
    async (request, reply) => {
      const userId = request.authUser?.userId || getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const body = request.body as { citizenDocId: string; arn: string; docTypeId: string };

      const internalArn = await requireCitizenOwnedApplicationAccess(
        request, reply, body.arn,
        "You are not allowed to attach documents to this application"
      );
      if (!internalArn) return;

      const appRecord = await applications.getApplication(internalArn);
      if (!appRecord) return send404(reply, "APPLICATION_NOT_FOUND");
      if (appRecord.state_id !== "DRAFT" && appRecord.state_id !== "QUERY_PENDING") {
        return send400(reply, "DOCUMENT_ATTACH_NOT_ALLOWED", "Documents can only be attached to DRAFT or QUERY_PENDING applications");
      }

      try {
        const result = await documents.reuseDocumentForApplication(
          userId, body.citizenDocId, internalArn, body.docTypeId
        );
        return { success: true, ...result };
      } catch (error: any) {
        if (error.message === "FORBIDDEN") {
          return send403(reply, "FORBIDDEN", "You do not own this document");
        }
        if (error.message === "CITIZEN_DOC_NOT_FOUND") {
          return send404(reply, "CITIZEN_DOC_NOT_FOUND");
        }
        return send400(reply, error.message);
      }
    }
  );

  // Download a locker document
  app.get(
    "/api/v1/citizens/me/documents/:citizenDocId/download",
    { schema: citizenDocIdParamsSchema },
    async (request, reply) => {
      const userId = request.authUser?.userId || getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const params = request.params as { citizenDocId: string };
      const doc = await documents.getCitizenDocument(params.citizenDocId);
      if (!doc) return send404(reply, "CITIZEN_DOC_NOT_FOUND");
      if (doc.user_id !== userId) return send403(reply, "FORBIDDEN", "You do not own this document");

      // Download gating: CANCELLED and EXPIRED documents are not downloadable
      if (doc.computed_status === "CANCELLED" || doc.computed_status === "EXPIRED") {
        return send403(reply, "DOCUMENT_NOT_DOWNLOADABLE", "This document cannot be downloaded because it is " + doc.computed_status.toLowerCase());
      }

      const fileBuffer = await documents.getCitizenDocumentFile(params.citizenDocId);
      if (!fileBuffer) return send404(reply, "FILE_NOT_FOUND");

      reply.type(doc.mime_type || "application/octet-stream");
      return fileBuffer;
    }
  );

  // Update document status (VALID / MISMATCH / CANCELLED)
  app.patch(
    "/api/v1/citizens/me/documents/:citizenDocId/status",
    {
      schema: {
        params: {
          type: "object",
          required: ["citizenDocId"],
          additionalProperties: false,
          properties: {
            citizenDocId: { type: "string", minLength: 1 },
          },
        },
        body: {
          type: "object",
          required: ["status"],
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["VALID", "MISMATCH", "CANCELLED"] },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.authUser?.userId || getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const params = request.params as { citizenDocId: string };
      const body = request.body as { status: string };

      try {
        await documents.updateCitizenDocumentStatus(params.citizenDocId, body.status, userId);
        return { success: true };
      } catch (error: any) {
        if (error.message === "CITIZEN_DOC_NOT_FOUND") {
          return send404(reply, "CITIZEN_DOC_NOT_FOUND");
        }
        if (error.message === "INVALID_STATUS") {
          return send400(reply, "INVALID_STATUS", "Status must be one of: VALID, MISMATCH, CANCELLED");
        }
        return send400(reply, error.message);
      }
    }
  );
}
