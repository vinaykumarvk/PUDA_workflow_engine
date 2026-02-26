import { FastifyInstance } from "fastify";
import * as applications from "../applications";
import { send400, send403 } from "../errors";
import {
  requireAuthorityStaffAccess,
  requireValidAuthorityId,
} from "../route-access";
import { registerApplicationCrudRoutes } from "./application-crud.routes";
import { registerApplicationWorkflowRoutes } from "./application-workflow.routes";
import { registerApplicationDetailRoutes } from "./application-detail.routes";

// ---------------------------------------------------------------------------
// Shared helpers — exported for sub-modules
// ---------------------------------------------------------------------------

export function toClientApplication(app: applications.Application) {
  return { ...app, arn: app.public_arn || app.arn, rowVersion: app.row_version };
}

/**
 * M8: Helper to extract ARN from wildcard param.
 * ARNs contain slashes (e.g. PUDA/NDC/2026/000001) so we use Fastify wildcard routes.
 */
export function arnFromWildcard(request: any): string {
  const params = request.params as Record<string, string | undefined>;
  return (params["*"] ?? "").replace(/^\//, "");
}

export type QueryResponseRequestBody = {
  queryId: string;
  responseMessage: string;
  updatedData?: Record<string, unknown>;
};

export function parseQueryResponseBody(reply: any, rawBody: unknown): QueryResponseRequestBody | null {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    reply.send(
      send400(reply, "INVALID_REQUEST_BODY", "Body must be an object")
    );
    return null;
  }
  const body = rawBody as Record<string, unknown>;
  const allowedKeys = new Set(["queryId", "responseMessage", "updatedData", "userId"]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    reply.send(
      send400(
        reply,
        "INVALID_REQUEST_BODY",
        `Unexpected field(s): ${unknownKeys.join(", ")}`
      )
    );
    return null;
  }
  if (typeof body.queryId !== "string" || !body.queryId.trim()) {
    reply.send(send400(reply, "QUERY_ID_REQUIRED", "queryId is required"));
    return null;
  }
  if (typeof body.responseMessage !== "string" || !body.responseMessage.trim()) {
    reply.send(
      send400(reply, "RESPONSE_MESSAGE_REQUIRED", "responseMessage is required")
    );
    return null;
  }
  if (
    body.updatedData !== undefined &&
    (typeof body.updatedData !== "object" ||
      body.updatedData === null ||
      Array.isArray(body.updatedData))
  ) {
    reply.send(
      send400(reply, "INVALID_REQUEST_BODY", "updatedData must be an object")
    );
    return null;
  }
  return {
    queryId: body.queryId,
    responseMessage: body.responseMessage,
    updatedData: body.updatedData as Record<string, unknown> | undefined,
  };
}

export async function resolveBackofficeAuthorityScope(
  request: any,
  reply: any,
  requestedAuthorityId: string | undefined,
  actionDescription: string
): Promise<string | undefined | null> {
  if (requestedAuthorityId) {
    const validAuthority = await requireValidAuthorityId(reply, requestedAuthorityId);
    if (!validAuthority) return null;
  }

  const userType = request.authUser?.userType;
  if (userType === "ADMIN") {
    return requestedAuthorityId;
  }

  if (userType !== "OFFICER") {
    reply.send(
      send403(
        reply,
        "FORBIDDEN",
        `Only officers and admins can ${actionDescription}`
      )
    );
    return null;
  }

  if (requestedAuthorityId) {
    const allowed = requireAuthorityStaffAccess(
      request,
      reply,
      requestedAuthorityId,
      `You are not allowed to ${actionDescription} in this authority`
    );
    if (!allowed) return null;
    return requestedAuthorityId;
  }

  const postingAuthorities = Array.from(
    new Set(
      ((request.authUser?.postings || []) as Array<{ authority_id?: string }>)
        .map((posting) => posting.authority_id)
        .filter((authorityId): authorityId is string => Boolean(authorityId))
    )
  );

  if (postingAuthorities.length === 1) {
    return postingAuthorities[0];
  }
  if (postingAuthorities.length === 0) {
    reply.send(
      send403(
        reply,
        "FORBIDDEN",
        `You are not posted to any authority and cannot ${actionDescription}`
      )
    );
    return null;
  }
  reply.send(
    send400(
      reply,
      "AUTHORITY_ID_REQUIRED",
      "authorityId query parameter is required when officer has access to multiple authorities"
    )
  );
  return null;
}

// ---------------------------------------------------------------------------
// Shared schemas — exported for sub-modules
// ---------------------------------------------------------------------------

export const createAppSchema = {
  body: {
    type: "object",
    required: ["authorityId", "serviceKey"],
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      serviceKey: { type: "string", minLength: 1 },
      applicantUserId: { type: "string" },
      data: { type: "object" },
      submissionChannel: { type: "string" },
      assistedByUserId: { type: "string" },
    },
  },
};

export const applicationWildcardParamsSchema = {
  type: "object",
  required: ["*"],
  additionalProperties: false,
  properties: {
    "*": { type: "string", minLength: 1 },
  },
};

export const applicationListSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

export const userScopedReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

export const applicationSearchSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      searchTerm: { type: "string", minLength: 1 },
      status: { type: "string", minLength: 1 },
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    },
  },
};

export const applicationExportSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      authorityId: { type: "string", minLength: 1 },
      searchTerm: { type: "string", minLength: 1 },
      status: { type: "string", minLength: 1 },
    },
  },
};

export const notificationsReadSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      offset: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      unreadOnly: { type: "string", enum: ["true", "false"] },
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

export const updateAppSchema = {
  params: applicationWildcardParamsSchema,
  body: {
    type: "object",
    required: ["data"],
    additionalProperties: false,
    properties: {
      data: { type: "object" },
      rowVersion: { type: "integer", minimum: 0 },
      userId: { type: "string" }, // test-mode fallback only
    },
  },
};

export const markNotificationReadSchema = {
  params: {
    type: "object",
    required: ["notificationId"],
    additionalProperties: false,
    properties: {
      notificationId: { type: "string", minLength: 1 },
    },
  },
  body: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      { type: "null" },
    ],
  },
};

export const applicationActionSchema = {
  params: applicationWildcardParamsSchema,
  body: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          queryId: { type: "string", minLength: 1 },
          responseMessage: { type: "string", minLength: 1 },
          updatedData: { type: "object" },
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["dueCode"],
        properties: {
          dueCode: { type: "string", minLength: 1 },
          paymentDate: { type: "string", minLength: 1 },
          userId: { type: "string", minLength: 1 }, // test-mode fallback only
        },
      },
      { type: "null" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Barrel: register all application sub-routes
// ---------------------------------------------------------------------------

export async function registerApplicationRoutes(app: FastifyInstance) {
  // IMPORTANT: Registration order matters for Fastify route matching.
  // Collection routes (exact paths) must be registered before wildcard routes.
  await registerApplicationCrudRoutes(app);

  // Workflow routes (PUT/POST wildcards) before GET wildcard
  await registerApplicationWorkflowRoutes(app);

  // Detail routes (notifications + GET wildcard) last
  await registerApplicationDetailRoutes(app);
}
