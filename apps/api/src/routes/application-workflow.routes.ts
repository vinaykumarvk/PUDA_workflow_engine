import { FastifyInstance } from "fastify";
import * as applications from "../applications";
import * as ndcPaymentStatus from "../ndc-payment-status";
import * as declarations from "../declarations";
import { getAuthUserId, send400, send403, send404 } from "../errors";
import { requireCitizenOwnedApplicationAccess } from "../route-access";
import {
  toClientApplication,
  arnFromWildcard,
  parseQueryResponseBody,
  updateAppSchema,
  applicationActionSchema,
} from "./application.routes";

export async function registerApplicationWorkflowRoutes(app: FastifyInstance) {
  // PUT /api/v1/applications/* — update application data (draft save)
  app.put("/api/v1/applications/*", { schema: updateAppSchema }, async (request, reply) => {
    const rawArn = arnFromWildcard(request);
    if (!rawArn) return send400(reply, "ARN_REQUIRED");

    const internalArn = await requireCitizenOwnedApplicationAccess(
      request,
      reply,
      rawArn,
      "You are not allowed to update this application"
    );
    if (!internalArn) return;

    const userId = request.authUser?.userId || getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");
    const body = request.body as { data: any; rowVersion?: number };
    try {
      const application = await applications.updateApplicationData(
        internalArn,
        body.data,
        userId,
        body.rowVersion,
        request.authUser?.userType || "CITIZEN"
      );
      return toClientApplication(application);
    } catch (error: any) {
      if (error.message === "CONFLICT") {
        reply.code(409);
        return { error: "CONFLICT", statusCode: 409, message: "Application was modified by another user. Please reload and retry." };
      }
      if (error.message === "FORBIDDEN") {
        return send403(reply, "FORBIDDEN", "You are not allowed to update this application");
      }
      return send400(reply, error.message);
    }
  });

  // POST /api/v1/applications/* — state transitions and actions via suffix
  // M8: POST wildcard — handles submit, query-response, pay-due, declarations via suffix
  // This is required because ARNs contain slashes, making parameterized routes impractical.
  app.post("/api/v1/applications/*", { schema: applicationActionSchema }, async (request, reply) => {
    const raw = arnFromWildcard(request);
    const userId = request.authUser?.userId || getAuthUserId(request, "userId");

    // Dispatch based on known suffixes
    if (raw.endsWith("/pay-due")) {
      const arn = raw.slice(0, -"/pay-due".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to post payment for this application"
      );
      if (!internalArn) return;

      const application = await applications.getApplication(internalArn);
      if (!application) return send404(reply, "APPLICATION_NOT_FOUND");
      if (application.service_key !== "no_due_certificate") {
        return send400(
          reply,
          "PAYMENT_POST_UNSUPPORTED",
          "Direct due payment posting is currently available for No Due Certificate only"
        );
      }

      const body = request.body as { dueCode?: string; paymentDate?: string };
      if (!body?.dueCode || typeof body.dueCode !== "string") {
        return send400(reply, "DUE_CODE_REQUIRED", "dueCode is required");
      }
      try {
        const result = await ndcPaymentStatus.postNdcPaymentForApplication(internalArn, {
          dueCode: body.dueCode,
          paymentDate: body.paymentDate,
        });
        return {
          success: true,
          paymentPosted: result.paymentPosted,
          paymentStatus: result.paymentStatus,
        };
      } catch (error: any) {
        if (error.message === "PROPERTY_NOT_FOUND") {
          return send404(reply, "PROPERTY_NOT_FOUND", "Linked property details are unavailable");
        }
        if (error.message === "DUE_ALREADY_PAID") {
          reply.code(409);
          return { error: "DUE_ALREADY_PAID", message: "Selected due is already paid" };
        }
        if (error.message === "DUE_NOT_FOUND") {
          return send400(reply, "DUE_NOT_FOUND", "Unknown or inapplicable dueCode for this property");
        }
        if (error.message === "INVALID_PAYMENT_DATE") {
          return send400(reply, "INVALID_PAYMENT_DATE", "paymentDate must be in YYYY-MM-DD format");
        }
        return send400(reply, error.message || "PAYMENT_POST_FAILED");
      }
    }

    if (raw.endsWith("/declarations")) {
      const arn = raw.slice(0, -"/declarations".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to submit declarations for this application"
      );
      if (!internalArn) return;
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const body = request.body as { docTypeId?: string; filledFields?: Record<string, string> };
      if (!body?.docTypeId || typeof body.docTypeId !== "string") {
        return send400(reply, "DOC_TYPE_ID_REQUIRED", "docTypeId is required");
      }
      if (!body.filledFields || typeof body.filledFields !== "object" || Array.isArray(body.filledFields)) {
        return send400(reply, "FILLED_FIELDS_REQUIRED", "filledFields must be an object");
      }
      try {
        const result = await declarations.submitDeclaration(
          internalArn,
          body.docTypeId,
          body.filledFields,
          userId
        );
        return { success: true, citizenDocId: result.citizenDocId, appDocId: result.appDocId };
      } catch (error: any) {
        if (error.message === "FORBIDDEN") {
          return send403(reply, "FORBIDDEN", "You are not allowed to submit declarations for this application");
        }
        if (error.message === "DECLARATION_TEMPLATE_NOT_FOUND") {
          return send400(reply, "DECLARATION_TEMPLATE_NOT_FOUND", "This document type does not support online declarations");
        }
        if (error.message === "INVALID_APPLICATION_STATE") {
          return send400(reply, "INVALID_APPLICATION_STATE", "Declarations can only be submitted for DRAFT or QUERY_PENDING applications");
        }
        return send400(reply, error.message);
      }
    }

    if (raw.endsWith("/submit")) {
      const arn = raw.slice(0, -"/submit".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to submit this application"
      );
      if (!internalArn) return;
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      try {
        return await applications.submitApplication(
          internalArn,
          userId,
          request.authUser?.userType || "CITIZEN"
        );
      } catch (error: any) {
        if (error.message === "FORBIDDEN") {
          return send403(reply, "FORBIDDEN", "You are not allowed to submit this application");
        }
        return send400(reply, error.message);
      }
    }

    if (raw.endsWith("/query-response")) {
      const arn = raw.slice(0, -"/query-response".length);
      const internalArn = await requireCitizenOwnedApplicationAccess(
        request,
        reply,
        arn,
        "You are not allowed to respond to this query"
      );
      if (!internalArn) return;
      if (!userId) return send400(reply, "USER_ID_REQUIRED");
      const body = parseQueryResponseBody(reply, request.body);
      if (!body) return;
      try {
        await applications.respondToQuery(
          internalArn,
          body.queryId,
          body.responseMessage,
          body.updatedData || {},
          userId,
          request.authUser?.userType || "CITIZEN"
        );
        return { success: true };
      } catch (error: any) {
        if (error.message === "FORBIDDEN") {
          return send403(reply, "FORBIDDEN", "You are not allowed to respond to this query");
        }
        return send400(reply, error.message);
      }
    }

    return send404(reply, "NOT_FOUND", "Unknown application action");
  });
}
