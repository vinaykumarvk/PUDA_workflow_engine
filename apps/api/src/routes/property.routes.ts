/**
 * Property API routes.
 *
 * Provides endpoints for:
 * - Looking up a property by authority + UPN
 * - Getting the property linked to an application
 * - Getting all applications linked to a property
 * - Searching properties by authority + filters
 */
import { FastifyInstance } from "fastify";
import {
  getPropertyByUPN,
  getPropertyById,
  getPropertyForApplication,
  getApplicationsForProperty,
  searchProperties,
  getCitizenProperties,
} from "../properties";
import { getAuthUserId, send400, send404 } from "../errors";
import {
  buildNdcPaymentStatusFromProperty,
  postNdcPaymentByUpn,
} from "../ndc-payment-status";
import {
  requireApplicationReadAccess,
  requireAuthorityStaffAccess,
  requireValidAuthorityId,
} from "../route-access";

const propertySearchSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      schemeName: { type: "string", minLength: 1 },
      plotNo: { type: "string", minLength: 1 },
      upn: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    },
  },
};

const propertyByUpnSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      upn: { type: "string", minLength: 1 },
    },
  },
};

const ndcPaymentByUpnSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      upn: { type: "string", minLength: 1 },
    },
    required: ["authorityId", "upn"],
  },
};

const ndcPaymentPostByUpnSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      upn: { type: "string", minLength: 1 },
    },
    required: ["authorityId", "upn"],
  },
  body: {
    type: "object",
    additionalProperties: false,
    required: ["dueCode"],
    properties: {
      dueCode: { type: "string", minLength: 1 },
      paymentDate: { type: "string", minLength: 1 },
    },
  },
};

const propertyIdParamsSchema = {
  params: {
    type: "object",
    required: ["propertyId"],
    additionalProperties: false,
    properties: {
      propertyId: { type: "string", minLength: 1 },
    },
  },
};

const applicationPropertyParamsSchema = {
  params: {
    type: "object",
    required: ["*"],
    additionalProperties: false,
    properties: {
      "*": { type: "string", minLength: 1 },
    },
  },
};

export async function registerPropertyRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/ndc/payment-status/by-upn",
    { schema: ndcPaymentByUpnSchema },
    async (request, reply) => {
      const userId = getAuthUserId(request);
      if (!userId) {
        return send400(reply, "USER_ID_REQUIRED");
      }
      const qs = request.query as { authorityId: string; upn: string };
      const validAuthority = await requireValidAuthorityId(reply, qs.authorityId);
      if (!validAuthority) return;

      const authUserType = request.authUser?.userType;
      if (authUserType === "CITIZEN") {
        // Verify ownership by UPN alone — the citizen's linked property
        // is the authoritative source for which authority it belongs to.
        const owned = await getCitizenProperties(userId);
        const ownedProperty = owned.find(
          (property) => property.unique_property_number === qs.upn
        );
        if (!ownedProperty) {
          reply.code(403);
          return { error: "FORBIDDEN", message: "You are not allowed to access this property payment status" };
        }
        // Use the property's actual authority to resolve the ledger.
        const property = await getPropertyByUPN(ownedProperty.authority_id, qs.upn);
        if (!property) {
          return send404(reply, "Property not found");
        }
        return { paymentStatus: buildNdcPaymentStatusFromProperty(property) };
      } else {
        const allowed = requireAuthorityStaffAccess(
          request,
          reply,
          qs.authorityId,
          "You are not allowed to access properties in this authority"
        );
        if (!allowed) return;
      }

      const property = await getPropertyByUPN(qs.authorityId, qs.upn);
      if (!property) {
        return send404(reply, "Property not found");
      }

      return { paymentStatus: buildNdcPaymentStatusFromProperty(property) };
    }
  );

  app.post(
    "/api/v1/ndc/payments/by-upn",
    { schema: ndcPaymentPostByUpnSchema },
    async (request, reply) => {
      const userId = getAuthUserId(request);
      if (!userId) {
        return send400(reply, "USER_ID_REQUIRED");
      }
      const qs = request.query as { authorityId: string; upn: string };
      const validAuthority = await requireValidAuthorityId(reply, qs.authorityId);
      if (!validAuthority) return;

      const authUserType = request.authUser?.userType;
      let resolvedAuthorityId = qs.authorityId;
      if (authUserType === "CITIZEN") {
        const owned = await getCitizenProperties(userId);
        const ownedProperty = owned.find(
          (property) => property.unique_property_number === qs.upn
        );
        if (!ownedProperty) {
          reply.code(403);
          return { error: "FORBIDDEN", message: "You are not allowed to post payment for this property" };
        }
        resolvedAuthorityId = ownedProperty.authority_id;
      } else {
        const allowed = requireAuthorityStaffAccess(
          request,
          reply,
          qs.authorityId,
          "You are not allowed to access properties in this authority"
        );
        if (!allowed) return;
      }

      const body = request.body as { dueCode: string; paymentDate?: string };
      try {
        const result = await postNdcPaymentByUpn(resolvedAuthorityId, qs.upn, {
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
          return send404(reply, "Property not found");
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
  );

  // -----------------------------------------------------------------------
  // GET /api/v1/citizens/me/properties
  // Returns all properties linked to the logged-in citizen (UPN picker data).
  // -----------------------------------------------------------------------
  app.get("/api/v1/citizens/me/properties", async (request) => {
    const userId = getAuthUserId(request);
    if (!userId) {
      return { properties: [] };
    }
    const properties = await getCitizenProperties(userId);
    return { properties };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/properties/search?authorityId=...&schemeName=...&plotNo=...&upn=...
  // -----------------------------------------------------------------------
  app.get("/api/v1/properties/search", { schema: propertySearchSchema }, async (request, reply) => {
    getAuthUserId(request); // ensure auth is present
    const qs = request.query as Record<string, string | undefined>;
    const authorityId = qs.authorityId;
    if (!authorityId) {
      reply.code(400);
      return { error: "authorityId query parameter is required" };
    }
    const validAuthority = await requireValidAuthorityId(reply, authorityId);
    if (!validAuthority) return;
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      authorityId,
      "You are not allowed to search properties in this authority"
    );
    if (!allowed) return;

    const results = await searchProperties(
      authorityId,
      {
        schemeName: qs.schemeName,
        plotNo: qs.plotNo,
        upnPrefix: qs.upn,
      },
      Math.min(parseInt(qs.limit || "50", 10), 200),
      parseInt(qs.offset || "0", 10)
    );

    return { properties: results };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/properties/by-upn?authorityId=...&upn=...
  // -----------------------------------------------------------------------
  app.get("/api/v1/properties/by-upn", { schema: propertyByUpnSchema }, async (request, reply) => {
    getAuthUserId(request);
    const qs = request.query as Record<string, string | undefined>;
    if (!qs.authorityId || !qs.upn) {
      reply.code(400);
      return { error: "authorityId and upn query parameters are required" };
    }
    const validAuthority = await requireValidAuthorityId(reply, qs.authorityId);
    if (!validAuthority) return;
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      qs.authorityId,
      "You are not allowed to access properties in this authority"
    );
    if (!allowed) return;

    const prop = await getPropertyByUPN(qs.authorityId, qs.upn);
    if (!prop) {
      return send404(reply, "Property not found");
    }
    return { property: prop };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/properties/:propertyId
  // -----------------------------------------------------------------------
  app.get("/api/v1/properties/:propertyId", { schema: propertyIdParamsSchema }, async (request, reply) => {
    getAuthUserId(request);
    const { propertyId } = request.params as { propertyId: string };

    const prop = await getPropertyById(propertyId);
    if (!prop) {
      return send404(reply, "Property not found");
    }
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      prop.authority_id,
      "You are not allowed to access this property"
    );
    if (!allowed) return;
    return { property: prop };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/properties/:propertyId/applications
  // -----------------------------------------------------------------------
  app.get(
    "/api/v1/properties/:propertyId/applications",
    { schema: propertyIdParamsSchema },
    async (request, reply) => {
    getAuthUserId(request);
    const { propertyId } = request.params as { propertyId: string };

    const prop = await getPropertyById(propertyId);
    if (!prop) {
      return send404(reply, "Property not found");
    }
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      prop.authority_id,
      "You are not allowed to access applications for this property"
    );
    if (!allowed) return;

    const apps = await getApplicationsForProperty(propertyId);
    return { property: prop, applications: apps };
    }
  );

  // -----------------------------------------------------------------------
  // GET /api/v1/applications/*/property  (get property linked to an application)
  // -----------------------------------------------------------------------
  app.get("/api/v1/application-property/*", { schema: applicationPropertyParamsSchema }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");

    if (!arnOrPublic) {
      reply.code(400);
      return { error: "ARN is required" };
    }

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access property for this application"
    );
    if (!arn) return;

    const prop = await getPropertyForApplication(arn);
    if (!prop) {
      return { property: null, message: "No property linked to this application" };
    }
    return { property: prop };
  });
}
