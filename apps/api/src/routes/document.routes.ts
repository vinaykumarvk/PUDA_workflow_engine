import { FastifyInstance } from "fastify";
import path from "path";
import * as applications from "../applications";
import * as documents from "../documents";
import { query } from "../db";
import { getAuthUserId, send400, send404 } from "../errors";
import {
  requireApplicationReadAccess,
  requireCitizenOwnedApplicationAccess,
} from "../route-access";

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || "upload");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255) || "upload";
}

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const docIdParamsSchema = {
  params: {
    type: "object",
    required: ["docId"],
    additionalProperties: false,
    properties: {
      docId: { type: "string", minLength: 1 },
    },
  },
};

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/documents/upload",
    { config: { skipStrictMutationBodySchema: true } },
    async (request, reply) => {
    // H1: Derive userId from JWT token
    const userId = request.authUser?.userId || getAuthUserId(request, "userId");
    const data = await request.file();
    if (!data) return send400(reply, "NO_FILE");
    const fields = (data as any).fields as Record<string, { value: string }> | undefined;
    const allowedFieldNames = new Set(["arn", "docTypeId", "userId", data.fieldname]);
    const unexpectedFieldNames = Object.keys(fields || {}).filter(
      (fieldName) => !allowedFieldNames.has(fieldName)
    );
    if (unexpectedFieldNames.length > 0) {
      return send400(
        reply,
        "INVALID_FIELDS",
        `Unexpected form field(s): ${unexpectedFieldNames.join(", ")}`
      );
    }
    const arn = fields?.arn?.value;
    const docTypeId = fields?.docTypeId?.value;
    const fieldUserId = fields?.userId?.value;
    // Prefer JWT user identity; form userId is kept only for compatibility.
    const effectiveUserId = userId || fieldUserId;
    if (!arn || !docTypeId || !effectiveUserId) return send400(reply, "MISSING_FIELDS");

    if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return send400(reply, "INVALID_FILE_TYPE", `Only PDF, JPEG, and PNG files are allowed. Received: ${data.mimetype}`);
    }
    const ext = (data.filename || "").toLowerCase().split(".").pop();
    if (ext && !ALLOWED_EXTENSIONS.includes(`.${ext}`)) {
      return send400(reply, "INVALID_FILE_EXTENSION", `File extension .${ext} is not allowed.`);
    }

    const internalArn = await requireCitizenOwnedApplicationAccess(
      request,
      reply,
      arn,
      "You are not allowed to upload documents for this application"
    );
    if (!internalArn) return;

    const appRecord = await applications.getApplication(internalArn);
    if (!appRecord) return send404(reply, "APPLICATION_NOT_FOUND");
    if (appRecord.state_id === "QUERY_PENDING") {
      const queryResult = await query(
        "SELECT 1 FROM query WHERE arn = $1 AND status = 'PENDING' AND $2 = ANY(unlocked_doc_type_ids) LIMIT 1",
        [internalArn, docTypeId]
      );
      if (queryResult.rows.length === 0) return send400(reply, "DOCUMENT_NOT_UNLOCKED");
    } else if (appRecord.state_id !== "DRAFT") {
      return send400(reply, "DOCUMENT_UPLOAD_NOT_ALLOWED");
    }
    const safeFilename = sanitizeFilename(data.filename);
    const buffer = await data.toBuffer();
    try {
      return await documents.uploadDocument(internalArn, docTypeId, safeFilename, data.mimetype, buffer, effectiveUserId);
    } catch (error: any) {
      return send400(reply, error.message);
    }
    }
  );

  app.get("/api/v1/documents/:docId", { schema: docIdParamsSchema }, async (request, reply) => {
    const params = request.params as { docId: string };
    const doc = await documents.getDocument(params.docId);
    if (!doc) return send404(reply, "DOCUMENT_NOT_FOUND");

    const internalArn = await requireApplicationReadAccess(
      request,
      reply,
      doc.arn,
      "You are not allowed to access this document"
    );
    if (!internalArn) return;

    return doc;
  });

  app.get("/api/v1/documents/:docId/download", { schema: docIdParamsSchema }, async (request, reply) => {
    const params = request.params as { docId: string };
    const doc = await documents.getDocument(params.docId);
    if (!doc) return send404(reply, "DOCUMENT_NOT_FOUND");

    const internalArn = await requireApplicationReadAccess(
      request,
      reply,
      doc.arn,
      "You are not allowed to access this document"
    );
    if (!internalArn) return;

    const fileBuffer = await documents.getDocumentFile(params.docId);
    if (!fileBuffer) return send404(reply, "FILE_NOT_FOUND");
    reply.type(doc?.mime_type || "application/octet-stream");
    return fileBuffer;
  });
}
