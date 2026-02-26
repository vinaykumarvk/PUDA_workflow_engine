import { randomUUID } from "node:crypto";
import Fastify, { FastifyInstance, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  isServicePackNotFoundError,
  loadServiceConfig,
  loadServicePacks,
  validateAllServicePackForms,
} from "./service-packs";
import { isPublicRoutePath, registerAuthMiddleware } from "./middleware/auth";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerTaskRoutes } from "./routes/task.routes";
import { registerDocumentRoutes } from "./routes/document.routes";
import { registerApplicationRoutes } from "./routes/application.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerPropertyRoutes } from "./routes/property.routes";
import { registerInspectionRoutes } from "./routes/inspection.routes";
import { registerFeeRoutes } from "./routes/fee.routes";
import { registerDecisionRoutes } from "./routes/decision.routes";
import { registerCommunicationRoutes } from "./routes/communication.routes";
import { registerProfileRoutes } from "./routes/profile.routes";
import { registerTelemetryRoutes } from "./routes/telemetry.routes";
import { registerCitizenDocumentRoutes } from "./routes/citizen-document.routes";
import { registerComplaintRoutes } from "./routes/complaint.routes";
import { registerAIRoutes } from "./routes/ai.routes";
import { startSLAChecker } from "./sla-checker";
import { startClientTelemetryRetentionJob } from "./telemetry-retention";
import { registerTransport } from "./notifications";
import { createEmailTransport } from "./transports/email";
import { createSmsTransport } from "./transports/sms";
import { verifyAuditChainIntegrity } from "./audit-chain";
import { cleanupExpiredMfaChallenges } from "./mfa-stepup";
import { cleanupExpiredRevocations } from "./token-security";
import { evaluateRuntimeAdapterPreflight, runRuntimeAdapterPreflightOrThrow } from "./runtime-adapter-preflight";
import { send400, sendError } from "./errors";
import { logError } from "./logger";
import { setLogContext } from "./log-context";
import {
  getMetricsContentType,
  getMetricsSnapshot,
  recordHttpRequestMetric,
  updateDbPoolMetric,
  updateWorkflowBacklogMetric,
} from "./observability/metrics";

type TimedRequest = FastifyRequest & {
  metricsStartedAtNs?: bigint;
};

const DEFAULT_API_SUCCESS_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: true,
  description: "Generic success payload. Route-specific response schema is recommended.",
};

const DEFAULT_API_ERROR_RESPONSE_SCHEMA = {
  type: "object",
  required: ["error", "message", "statusCode"],
  additionalProperties: false,
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    statusCode: { type: "integer", minimum: 400, maximum: 599 },
  },
};

const DEFAULT_API_ERROR_RESPONSE_STATUS_CODES = [
  "400",
  "401",
  "403",
  "404",
  "409",
  "429",
  "500",
] as const;

function asPlainObject(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  return node as Record<string, unknown>;
}

function normalizeRouteMethods(method: unknown): string[] {
  if (Array.isArray(method)) {
    return method.map((entry) => String(entry).toUpperCase());
  }
  if (method == null) return [];
  return [String(method).toUpperCase()];
}

function inferApiTag(url: string): string {
  if (url.startsWith("/api/v1/auth/")) return "auth";
  if (url.startsWith("/api/v1/tasks/")) return "tasks";
  if (url.startsWith("/api/v1/applications/")) return "applications";
  if (url.startsWith("/api/v1/documents/")) return "documents";
  if (url.startsWith("/api/v1/citizens/me/documents")) return "documents";
  if (url.startsWith("/api/v1/admin/")) return "admin";
  if (url.startsWith("/api/v1/properties/")) return "properties";
  if (url.startsWith("/api/v1/inspections/")) return "inspections";
  if (url.startsWith("/api/v1/fees/")
    || url.startsWith("/api/v1/payments/")
    || url.startsWith("/api/v1/refunds/")) return "payments";
  if (url.startsWith("/api/v1/notification-logs/")
    || url.startsWith("/api/v1/notifications/")
    || url.startsWith("/api/v1/notices/")
    || url.startsWith("/api/v1/communications/")) return "notifications";
  if (url.startsWith("/api/v1/profile/")) return "profile";
  if (url.startsWith("/api/v1/telemetry/")) return "telemetry";
  if (url.startsWith("/api/v1/config/")) return "config";
  if (url.startsWith("/api/v1/decisions/")) return "decisions";
  return "api";
}

function inferOperationId(method: string, url: string): string {
  const cleanedPath = url
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment === "*") return "wildcard";
      if (segment.startsWith(":")) return `by_${segment.slice(1)}`;
      return segment.replace(/[^A-Za-z0-9]+/g, "_");
    })
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${method.toLowerCase()}_${cleanedPath}` || `${method.toLowerCase()}_root`;
}

function ensureOpenApiContractDefaults(input: {
  schema: unknown;
  url: string;
  method: string;
}): Record<string, unknown> {
  const routeSchema = asPlainObject(input.schema);
  const nextSchema: Record<string, unknown> = routeSchema ? { ...routeSchema } : {};

  if (!input.url.startsWith("/api/v1/")) {
    return nextSchema;
  }

  const currentOperationId = nextSchema.operationId;
  if (typeof currentOperationId !== "string" || currentOperationId.trim().length === 0) {
    nextSchema.operationId = inferOperationId(input.method, input.url);
  }

  const currentTags = nextSchema.tags;
  if (!Array.isArray(currentTags) || currentTags.length === 0) {
    nextSchema.tags = [inferApiTag(input.url)];
  }

  const currentSecurity = nextSchema.security;
  if (!isPublicRoutePath(input.url)) {
    if (!Array.isArray(currentSecurity) || currentSecurity.length === 0) {
      nextSchema.security = [{ bearerAuth: [] }];
    }
  }

  const responseNode = asPlainObject(nextSchema.response);
  const responseSchemas: Record<string, unknown> = responseNode ? { ...responseNode } : {};
  const has2xx = Object.keys(responseSchemas).some((statusCode) => /^2\d\d$/.test(statusCode));
  if (!has2xx) {
    responseSchemas["200"] = DEFAULT_API_SUCCESS_RESPONSE_SCHEMA;
  }
  for (const statusCode of DEFAULT_API_ERROR_RESPONSE_STATUS_CODES) {
    if (!responseSchemas[statusCode]) {
      responseSchemas[statusCode] = DEFAULT_API_ERROR_RESPONSE_SCHEMA;
    }
  }
  nextSchema.response = responseSchemas;

  return nextSchema;
}

function routeLabelForMetrics(request: FastifyRequest): string {
  const routeOptions = (request as FastifyRequest & { routeOptions?: { url?: string } }).routeOptions;
  if (routeOptions?.url) return routeOptions.url;
  const routerPath = (request as FastifyRequest & { routerPath?: string }).routerPath;
  if (routerPath) return routerPath;
  const rawPath = request.url.split("?")[0];
  return rawPath || "UNKNOWN_ROUTE";
}

function isStrictObjectSchema(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const schema = node as { type?: unknown; additionalProperties?: unknown };
  return schema.type === "object" && schema.additionalProperties === false;
}

function containsStrictObjectSchema(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  if (isStrictObjectSchema(node)) return true;
  const schema = node as {
    anyOf?: unknown;
    oneOf?: unknown;
    allOf?: unknown;
  };
  const unionNodes = [schema.anyOf, schema.oneOf, schema.allOf];
  return unionNodes.some(
    (entry) => Array.isArray(entry) && entry.some((item) => containsStrictObjectSchema(item))
  );
}

function hasStrictMutationBodySchema(routeSchema: unknown): boolean {
  if (!routeSchema || typeof routeSchema !== "object") return false;
  const body = (routeSchema as { body?: unknown }).body;
  return containsStrictObjectSchema(body);
}

function hasStrictRouteSchemaSection(
  routeSchema: unknown,
  section: "params" | "querystring"
): boolean {
  if (!routeSchema || typeof routeSchema !== "object") return false;
  const schemaSection = (routeSchema as Record<string, unknown>)[section];
  return containsStrictObjectSchema(schemaSection);
}

const GET_ROUTES_REQUIRING_STRICT_QUERY_SCHEMA = new Set([
  "/api/v1/config/services",
  "/api/v1/tasks/inbox",
  "/api/v1/applications",
  "/api/v1/applications/stats",
  "/api/v1/applications/pending-actions",
  "/api/v1/applications/search",
  "/api/v1/applications/export",
  "/api/v1/notifications",
  "/api/v1/properties/search",
  "/api/v1/properties/by-upn",
  "/api/v1/notification-logs/for-application/*",
  "/api/v1/notification-logs/my-logs",
  "/api/v1/notices/for-application/*",
  "/api/v1/inspections/my-queue",
  "/api/v1/admin/holidays",
  "/api/v1/admin/users",
  "/api/v1/admin/users/:userId/postings",
  "/api/v1/admin/stats",
  "/api/v1/admin/telemetry/cache",
  "/api/v1/admin/designations",
  "/api/v1/auth/me/postings",
  "/api/v1/profile/me",
  "/api/v1/citizens/me/documents",
  "/api/v1/config/services/:serviceKey/versions/compare",
]);

async function runServicePackPreflight(): Promise<void> {
  const services = await loadServicePacks();
  if (services.length === 0) {
    throw new Error("No service packs found under service-packs/");
  }
  // Validate all form.json field types against the FormRenderer's supported types.
  // This catches "field type X is not renderable" errors at boot, not at runtime.
  await validateAllServicePackForms();
}

/** Build and return the Fastify app with all routes (no listen). Used by server and tests. */
export async function buildApp(logger = true): Promise<FastifyInstance> {
  const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const docsEnabled = process.env.ENABLE_API_DOCS === "true" || process.env.NODE_ENV !== "production";
  const configuredRequestTimeoutMs = Number.parseInt(
    process.env.REQUEST_TIMEOUT_MS || "30000",
    10
  );
  const requestTimeoutMs = Number.isFinite(configuredRequestTimeoutMs) && configuredRequestTimeoutMs > 0
    ? configuredRequestTimeoutMs
    : 30000;
  const app = Fastify({
    logger,
    requestTimeout: requestTimeoutMs,
    requestIdHeader: "x-request-id",
    genReqId: (req) => {
      const incomingHeader = req.headers["x-request-id"];
      if (typeof incomingHeader === "string" && incomingHeader.trim().length > 0) {
        return incomingHeader.trim();
      }
      if (Array.isArray(incomingHeader) && incomingHeader[0]?.trim().length) {
        return incomingHeader[0].trim();
      }
      return randomUUID();
    },
    ajv: {
      customOptions: {
        // Keep unknown keys so strict schemas (additionalProperties: false)
        // return 400 instead of silently dropping fields.
        removeAdditional: false,
      },
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    const timedRequest = request as TimedRequest;
    timedRequest.metricsStartedAtNs = process.hrtime.bigint();
    setLogContext({ requestId: request.id });
    reply.header("x-request-id", request.id);
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute("request.id", request.id);
    }
  });

  app.addHook("onError", async (request, _reply, error) => {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    setLogContext({ requestId: request.id });
  });

  app.addHook("onResponse", async (request, reply) => {
    setLogContext({ requestId: request.id });
    const timedRequest = request as TimedRequest;
    if (!timedRequest.metricsStartedAtNs) return;
    const elapsedNs = process.hrtime.bigint() - timedRequest.metricsStartedAtNs;
    const durationSeconds = Number(elapsedNs) / 1_000_000_000;
    recordHttpRequestMetric({
      method: request.method,
      route: routeLabelForMetrics(request),
      statusCode: reply.statusCode,
      durationSeconds,
    });
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "PUDA Workflow Engine API",
        description: "Public API surface for PUDA citizen and officer workflows.",
        version: "1.0.0",
      },
      tags: [
        { name: "health", description: "Service health and readiness" },
        { name: "auth", description: "Authentication and identity" },
        { name: "applications", description: "Application lifecycle and submissions" },
        { name: "tasks", description: "Officer inbox and workflow actions" },
        { name: "documents", description: "Application document intake and management" },
        { name: "notifications", description: "Citizen/officer notifications and communication logs" },
        { name: "profile", description: "User profile read and update APIs" },
        { name: "properties", description: "Property discovery and lookup APIs" },
        { name: "inspections", description: "Inspection scheduling and execution APIs" },
        { name: "decisions", description: "Decision records and workflow outcomes" },
        { name: "telemetry", description: "Client telemetry ingestion and analytics" },
        { name: "config", description: "Service pack and runtime configuration endpoints" },
        { name: "payments", description: "Fee, payment, and refund operations" },
        { name: "admin", description: "Authority/admin analytics and management" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: ({ schema, url, route }) => {
      const methods = normalizeRouteMethods((route as { method?: unknown } | undefined)?.method);
      const primaryMethod = methods[0] || "GET";
      const transformedSchema = ensureOpenApiContractDefaults({
        schema,
        url,
        method: primaryMethod,
      });
      return { schema: transformedSchema, url };
    },
  });

  if (docsEnabled) {
    await app.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    const validationError = error as {
      validation?: unknown;
      validationContext?: unknown;
      message?: unknown;
    };
    if (validationError.validation) {
      const context = validationError.validationContext;
      const errorCode =
        context === "querystring"
          ? "INVALID_QUERY_PARAMS"
          : context === "params"
            ? "INVALID_PATH_PARAMS"
            : "INVALID_REQUEST_BODY";
      const message =
        typeof validationError.message === "string"
          ? validationError.message
          : "Request validation failed";
      return reply.send(
        send400(
          reply,
          errorCode,
          message
        )
      );
    }
    // Never expose internal error details to clients
    const err = error as Error & { statusCode?: number; code?: string };
    logError("Unhandled request error", {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
    });
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
      return reply.send(sendError(reply, 500, "INTERNAL_ERROR", "An unexpected error occurred"));
    }
    // For 4xx errors from Fastify itself (e.g. 404, 413), return a clean message
    return reply.send(sendError(reply, statusCode, err.code || "ERROR", err.message));
  });

  // Fail app boot early if service metadata is malformed/missing.
  // This prevents runtime drift where config endpoints are the first place to discover bad packs.
  try {
    await runServicePackPreflight();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown service-pack preflight error";
    throw new Error(`[SERVICE_PACK_PREFLIGHT_FAILED] ${message}`);
  }

  // Fail app boot early if runtime adapter configuration is unsafe.
  // This is especially important in production where stub providers can silently drop notifications/payments.
  const runtimeAdapterPreflight = evaluateRuntimeAdapterPreflight(process.env);
  for (const warning of runtimeAdapterPreflight.warnings) {
    app.log.warn(
      { code: warning.code, message: warning.message },
      "runtime adapter preflight warning"
    );
  }
  runRuntimeAdapterPreflightOrThrow(process.env);

  // Enforce strict body schema on all mutation routes by default.
  // Route authors can opt out with `config.skipStrictMutationBodySchema = true`
  // for non-JSON parsers like multipart, but must validate payload shape manually.
  app.addHook("onRoute", (routeOptions) => {
    const methods = (Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method]).map((method) => String(method).toUpperCase());
    const isMutation = methods.some((method) => {
      return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
    });
    if (isMutation) {
      const skipStrictMutationGuard =
        Boolean((routeOptions.config as { skipStrictMutationBodySchema?: boolean } | undefined)
          ?.skipStrictMutationBodySchema);
      if (!skipStrictMutationGuard && !hasStrictMutationBodySchema(routeOptions.schema)) {
        throw new Error(
          `[MUTATION_SCHEMA_REQUIRED] ${methods.join(",")} ${routeOptions.url} must define a strict body schema (additionalProperties=false object, optionally within anyOf/oneOf/allOf)`
        );
      }
      return;
    }

    if (!methods.includes("GET")) return;

    const skipStrictReadGuard =
      Boolean((routeOptions.config as { skipStrictReadSchema?: boolean } | undefined)
        ?.skipStrictReadSchema);
    if (skipStrictReadGuard) return;

    const routeHasPathParams = routeOptions.url.includes(":") || routeOptions.url.includes("*");
    if (
      routeHasPathParams &&
      !hasStrictRouteSchemaSection(routeOptions.schema, "params")
    ) {
      throw new Error(
        `[READ_PARAMS_SCHEMA_REQUIRED] GET ${routeOptions.url} must define a strict params schema (object + additionalProperties=false)`
      );
    }

    if (
      GET_ROUTES_REQUIRING_STRICT_QUERY_SCHEMA.has(routeOptions.url) &&
      !hasStrictRouteSchemaSection(routeOptions.schema, "querystring")
    ) {
      throw new Error(
        `[READ_QUERY_SCHEMA_REQUIRED] GET ${routeOptions.url} must define a strict querystring schema (object + additionalProperties=false)`
      );
    }
  });

  // B9: CORS — require explicit allowed origins outside tests.
  const rawAllowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!rawAllowedOrigins && !isTestRuntime) {
    throw new Error("FATAL: ALLOWED_ORIGINS must be set in non-test runtime");
  }
  const allowedOrigins = rawAllowedOrigins
    ? rawAllowedOrigins.split(",").map(o => o.trim()).filter(Boolean)
    : true;
  await app.register(cors, { origin: allowedOrigins });

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 }
  });

  // B4: Global rate limiting — default 100 req/min per IP (override via env for tests/load)
  const globalRateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX || "100", 10);
  const globalRateLimitWindow = process.env.RATE_LIMIT_WINDOW || "1 minute";
  await app.register(rateLimit, {
    max: Number.isFinite(globalRateLimitMax) ? globalRateLimitMax : 100,
    timeWindow: globalRateLimitWindow,
  });

  // Register JWT authentication middleware
  registerAuthMiddleware(app);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.get("/ready", async (_request, reply) => {
    try {
      const { query: dbQuery } = await import("./db");
      await dbQuery("SELECT 1");
      return { status: "ok" };
    } catch {
      reply.code(503);
      return { status: "degraded", reason: "database_unreachable" };
    }
  });

  app.get(
    "/metrics",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    },
    async (_request, reply) => {
      const { pool } = await import("./db");
      updateDbPoolMetric({
        totalClients: pool.totalCount,
        idleClients: pool.idleCount,
        waitingClients: pool.waitingCount,
      });
      reply.header("content-type", getMetricsContentType());
      reply.header("cache-control", "no-store");
      return getMetricsSnapshot();
    }
  );

  // Config routes (kept here as they're small/standalone)
  app.get(
    "/api/v1/config/services",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    },
    async () => {
      const services = await loadServicePacks();
      return { services };
    }
  );

  app.get(
    "/api/v1/config/services/:serviceKey",
    {
      schema: {
        params: {
          type: "object",
          required: ["serviceKey"],
          additionalProperties: false,
          properties: {
            serviceKey: { type: "string", pattern: "^[a-z0-9_]+$" },
          },
        },
      },
    },
    async (request, reply) => {
    const params = request.params as { serviceKey: string };
    try {
      const config = await loadServiceConfig(params.serviceKey);
      return config;
    } catch (error) {
      if (!isServicePackNotFoundError(error)) {
        throw error;
      }
      reply.code(404);
      return { error: "SERVICE_NOT_FOUND" };
    }
    }
  );

  // Version listing for a service
  app.get(
    "/api/v1/config/services/:serviceKey/versions",
    {
      schema: {
        params: {
          type: "object",
          required: ["serviceKey"],
          additionalProperties: false,
          properties: {
            serviceKey: { type: "string", pattern: "^[a-z0-9_]+$" },
          },
        },
      },
    },
    async (request, reply) => {
      const { serviceKey } = request.params as { serviceKey: string };
      const { query: dbQuery } = await import("./db");
      const result = await dbQuery(
        `SELECT
           sv.version,
           sv.status,
           sv.effective_from,
           sv.effective_to,
           sv.created_at,
           COALESCE(ac.cnt, 0)::int AS application_count,
           CASE WHEN sv.version = (
             SELECT version FROM service_version
             WHERE service_key = $1
               AND status = 'published'
               AND (effective_from IS NULL OR effective_from <= NOW())
               AND (effective_to   IS NULL OR effective_to   >  NOW())
             ORDER BY effective_from DESC NULLS LAST
             LIMIT 1
           ) THEN true ELSE false END AS is_active
         FROM service_version sv
         LEFT JOIN (
           SELECT service_key, service_version, COUNT(*)::int AS cnt
           FROM application
           GROUP BY service_key, service_version
         ) ac ON ac.service_key = sv.service_key AND ac.service_version = sv.version
         WHERE sv.service_key = $1
         ORDER BY sv.created_at DESC`,
        [serviceKey]
      );
      if (result.rows.length === 0) {
        reply.code(404);
        return { error: "SERVICE_NOT_FOUND", message: `No versions found for service '${serviceKey}'`, statusCode: 404 };
      }
      return {
        versions: result.rows.map((r: any) => ({
          version: r.version,
          status: r.status,
          effectiveFrom: r.effective_from,
          effectiveTo: r.effective_to,
          createdAt: r.created_at,
          applicationCount: r.application_count,
          isActive: r.is_active,
        })),
      };
    }
  );

  // Single version config for a service
  app.get(
    "/api/v1/config/services/:serviceKey/versions/:version",
    {
      schema: {
        params: {
          type: "object",
          required: ["serviceKey", "version"],
          additionalProperties: false,
          properties: {
            serviceKey: { type: "string", pattern: "^[a-z0-9_]+$" },
            version: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
          },
        },
      },
    },
    async (request, reply) => {
      const { serviceKey, version } = request.params as { serviceKey: string; version: string };
      const { query: dbQuery } = await import("./db");
      const result = await dbQuery(
        `SELECT sv.version, sv.status, sv.effective_from, sv.effective_to, sv.created_at, sv.config_jsonb,
                s.name AS display_name, s.category, s.description
         FROM service_version sv
         JOIN service s ON s.service_key = sv.service_key
         WHERE sv.service_key = $1 AND sv.version = $2`,
        [serviceKey, version]
      );
      if (result.rows.length === 0) {
        reply.code(404);
        return { error: "VERSION_NOT_FOUND", message: `Version '${version}' not found for service '${serviceKey}'`, statusCode: 404 };
      }
      const row = result.rows[0];
      const config = typeof row.config_jsonb === "string" ? JSON.parse(row.config_jsonb) : row.config_jsonb;
      return {
        serviceKey,
        version: row.version,
        status: row.status,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        createdAt: row.created_at,
        displayName: row.display_name,
        category: row.category,
        description: row.description,
        ...config,
      };
    }
  );

  // Compare two versions of a service
  app.get(
    "/api/v1/config/services/:serviceKey/versions/compare",
    {
      schema: {
        params: {
          type: "object",
          required: ["serviceKey"],
          additionalProperties: false,
          properties: {
            serviceKey: { type: "string", pattern: "^[a-z0-9_]+$" },
          },
        },
        querystring: {
          type: "object",
          required: ["v1", "v2"],
          additionalProperties: false,
          properties: {
            v1: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
            v2: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
          },
        },
      },
    },
    async (request, reply) => {
      const { serviceKey } = request.params as { serviceKey: string };
      const { v1, v2 } = request.query as { v1: string; v2: string };
      const { query: dbQuery } = await import("./db");
      const { diffWorkflows, diffDocuments } = await import("./version-diff");

      const result = await dbQuery(
        `SELECT version, config_jsonb FROM service_version WHERE service_key = $1 AND version IN ($2, $3)`,
        [serviceKey, v1, v2]
      );
      const byVersion = new Map(result.rows.map((r: any) => [r.version, typeof r.config_jsonb === "string" ? JSON.parse(r.config_jsonb) : r.config_jsonb]));
      const configA = byVersion.get(v1);
      const configB = byVersion.get(v2);
      if (!configA || !configB) {
        reply.code(404);
        return { error: "VERSION_NOT_FOUND", message: `One or both versions not found`, statusCode: 404 };
      }
      return {
        v1,
        v2,
        workflow: diffWorkflows(configA.workflow, configB.workflow),
        documents: diffDocuments(configA.documents, configB.documents),
      };
    }
  );

  // C1: Route modules
  await registerAuthRoutes(app);
  await registerTaskRoutes(app);
  await registerDocumentRoutes(app);
  await registerApplicationRoutes(app);
  await registerAdminRoutes(app);
  await registerPropertyRoutes(app);
  await registerInspectionRoutes(app);
  await registerFeeRoutes(app);
  await registerDecisionRoutes(app);
  await registerCommunicationRoutes(app);
  await registerProfileRoutes(app);
  await registerCitizenDocumentRoutes(app);
  await registerComplaintRoutes(app);
  await registerTelemetryRoutes(app);
  await registerAIRoutes(app);

  if (docsEnabled) {
    app.get("/api/v1/openapi.json", async (_request, reply) => {
      reply.header("cache-control", "no-store");
      return app.swagger();
    });
  }

  // C4: Register runtime-configured notification transports (stub/smtp/sms providers)
  if (process.env.NODE_ENV !== "test") {
    registerTransport(createEmailTransport());
    registerTransport(createSmsTransport());
  }

  // H3: Start SLA breach detection (runs every 30 minutes in production)
  if (!isTestRuntime) {
    const intervalMs = parseInt(process.env.SLA_CHECK_INTERVAL_MS || "1800000"); // default 30 min
    startSLAChecker(intervalMs);
  }

  // Retain client cache telemetry for bounded history to keep audit_event growth controlled.
  if (process.env.NODE_ENV !== "test") {
    startClientTelemetryRetentionJob();
  }

  // Publish workflow backlog gauges for operational dashboards and SLO alerts.
  let workflowBacklogTimer: NodeJS.Timeout | null = null;
  if (process.env.ENABLE_WORKFLOW_BACKLOG_METRICS !== "false" && !isTestRuntime) {
    const configuredIntervalMs = Number.parseInt(
      process.env.WORKFLOW_BACKLOG_METRICS_INTERVAL_MS || "30000",
      10
    );
    const intervalMs = Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
      ? configuredIntervalMs
      : 30000;
    const refreshWorkflowBacklogMetrics = async () => {
      try {
        const { query: dbQuery } = await import("./db");
        const result = await dbQuery(
          `SELECT
             COUNT(*) FILTER (WHERE status IN ('PENDING', 'IN_PROGRESS'))::int AS open_tasks,
             COUNT(*) FILTER (
               WHERE status IN ('PENDING', 'IN_PROGRESS')
                 AND sla_due_at IS NOT NULL
                 AND sla_due_at < NOW()
             )::int AS overdue_tasks
           FROM task`
        );
        updateWorkflowBacklogMetric({
          openTasks: Number(result.rows[0]?.open_tasks || 0),
          overdueTasks: Number(result.rows[0]?.overdue_tasks || 0),
        });
      } catch (error) {
        app.log.warn({ error }, "workflow backlog metrics refresh failed");
      }
    };
    await refreshWorkflowBacklogMetrics();
    workflowBacklogTimer = setInterval(() => {
      void refreshWorkflowBacklogMetrics();
    }, intervalMs);
    workflowBacklogTimer.unref();
  }

  let tokenRevocationCleanupTimer: NodeJS.Timeout | null = null;
  if (!isTestRuntime) {
    const configuredIntervalMs = Number.parseInt(
      process.env.JWT_DENYLIST_CLEANUP_INTERVAL_MS || "3600000",
      10
    );
    const cleanupIntervalMs = Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
      ? configuredIntervalMs
      : 3600000;
    tokenRevocationCleanupTimer = setInterval(() => {
      void cleanupExpiredRevocations();
    }, cleanupIntervalMs);
    tokenRevocationCleanupTimer.unref();
  }

  let mfaChallengeCleanupTimer: NodeJS.Timeout | null = null;
  if (!isTestRuntime) {
    const configuredIntervalMs = Number.parseInt(
      process.env.MFA_CHALLENGE_CLEANUP_INTERVAL_MS || "900000",
      10
    );
    const cleanupIntervalMs = Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
      ? configuredIntervalMs
      : 900000;
    mfaChallengeCleanupTimer = setInterval(() => {
      void cleanupExpiredMfaChallenges();
    }, cleanupIntervalMs);
    mfaChallengeCleanupTimer.unref();
  }

  let auditChainVerifyTimer: NodeJS.Timeout | null = null;
  if (!isTestRuntime && process.env.ENABLE_AUDIT_CHAIN_VERIFICATION_JOB === "true") {
    const configuredIntervalMs = Number.parseInt(
      process.env.AUDIT_CHAIN_VERIFY_INTERVAL_MS || "21600000",
      10
    );
    const verifyIntervalMs = Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
      ? configuredIntervalMs
      : 21600000;
    const runAuditChainVerification = async () => {
      try {
        const verification = await verifyAuditChainIntegrity();
        if (!verification.ok) {
          app.log.error(
            {
              checked: verification.checked,
              mismatch: verification.mismatch,
            },
            "audit hash-chain verification failed"
          );
          return;
        }
        app.log.info({ checked: verification.checked }, "audit hash-chain verification passed");
      } catch (error) {
        app.log.error({ error }, "audit hash-chain verification job failed");
      }
    };
    auditChainVerifyTimer = setInterval(() => {
      void runAuditChainVerification();
    }, verifyIntervalMs);
    auditChainVerifyTimer.unref();
  }

  app.addHook("onClose", async () => {
    if (workflowBacklogTimer) {
      clearInterval(workflowBacklogTimer);
      workflowBacklogTimer = null;
    }
    if (tokenRevocationCleanupTimer) {
      clearInterval(tokenRevocationCleanupTimer);
      tokenRevocationCleanupTimer = null;
    }
    if (mfaChallengeCleanupTimer) {
      clearInterval(mfaChallengeCleanupTimer);
      mfaChallengeCleanupTimer = null;
    }
    if (auditChainVerifyTimer) {
      clearInterval(auditChainVerifyTimer);
      auditChainVerifyTimer = null;
    }
  });

  return app;
}
