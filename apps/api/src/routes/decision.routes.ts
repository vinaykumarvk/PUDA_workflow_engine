/**
 * Decision & Output API routes.
 *
 * Provides endpoints for:
 * - Querying decisions for an application
 * - Querying outputs (certificates, orders) for an application
 * - Enhanced output metadata (artifact type, validity, decision link)
 */
import { FastifyInstance } from "fastify";
import { getDecisionsForApplication, getLatestDecision } from "../decisions";
import { getOutputsForApplication, getOutputByArn } from "../outputs";
import { send400 } from "../errors";
import { requireApplicationReadAccess } from "../route-access";

const arnWildcardParamsSchema = {
  params: {
    type: "object",
    required: ["*"],
    additionalProperties: false,
    properties: {
      "*": { type: "string", minLength: 1 },
    },
  },
};

export async function registerDecisionRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // DECISIONS
  // -----------------------------------------------------------------------

  /** GET /api/v1/decisions/for-application/* — all decisions for an application */
  app.get("/api/v1/decisions/for-application/*", { schema: arnWildcardParamsSchema }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access decisions for this application"
    );
    if (!arn) return;

    const decisions = await getDecisionsForApplication(arn);
    return { decisions };
  });

  /** GET /api/v1/decisions/latest/* — get the latest (final) decision for an application */
  app.get("/api/v1/decisions/latest/*", { schema: arnWildcardParamsSchema }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access decisions for this application"
    );
    if (!arn) return;

    const decision = await getLatestDecision(arn);
    if (!decision) {
      return { decision: null, message: "No decision recorded yet for this application" };
    }
    return { decision };
  });

  // -----------------------------------------------------------------------
  // OUTPUTS (enhanced)
  // -----------------------------------------------------------------------

  /** GET /api/v1/outputs/for-application/* — all outputs for an application */
  app.get("/api/v1/outputs/for-application/*", { schema: arnWildcardParamsSchema }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access outputs for this application"
    );
    if (!arn) return;

    const outputs = await getOutputsForApplication(arn);
    return { outputs };
  });

  /** GET /api/v1/outputs/latest/* — get the latest output for an application */
  app.get("/api/v1/outputs/latest/*", { schema: arnWildcardParamsSchema }, async (request, reply) => {
    const params = request.params as Record<string, string | undefined>;
    const arnOrPublic = (params["*"] ?? "").replace(/^\//, "");
    if (!arnOrPublic) return send400(reply, "ARN is required");

    const arn = await requireApplicationReadAccess(
      request,
      reply,
      arnOrPublic,
      "You are not allowed to access outputs for this application"
    );
    if (!arn) return;

    const output = await getOutputByArn(arn);
    if (!output) {
      return { output: null, message: "No output generated yet for this application" };
    }
    return { output };
  });
}
