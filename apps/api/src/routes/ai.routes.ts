import type { FastifyInstance } from "fastify";
import { parseComplaint, summarizeTimeline, isAIConfigured } from "../ai";
import { requireApplicationReadAccess } from "../route-access";
import { send404 } from "../errors";
import * as applications from "../applications";
import { query } from "../db";

export async function registerAIRoutes(app: FastifyInstance) {
  // Parse complaint from voice transcript
  app.post("/api/v1/ai/parse-complaint", {
    schema: {
      body: {
        type: "object",
        required: ["transcript"],
        additionalProperties: false,
        properties: {
          transcript: { type: "string", minLength: 1, maxLength: 5000 },
          language: { type: "string", enum: ["hi", "en", "pa"] },
        },
      },
    },
  }, async (request, reply) => {
    if (!isAIConfigured()) {
      reply.code(503);
      return { error: "AI_NOT_CONFIGURED", message: "AI features are not available" };
    }

    const { transcript, language = "en" } = request.body as {
      transcript: string;
      language?: "hi" | "en" | "pa";
    };

    const result = await parseComplaint(transcript, language);
    return result;
  });

  // Summarize application timeline — accepts ARN, fetches data server-side with authz
  app.post("/api/v1/ai/summarize-timeline", {
    schema: {
      body: {
        type: "object",
        required: ["arn"],
        additionalProperties: false,
        properties: {
          arn: { type: "string", minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    if (!isAIConfigured()) {
      reply.code(503);
      return { error: "AI_NOT_CONFIGURED", message: "AI features are not available" };
    }

    const { arn } = request.body as { arn: string };

    const internalArn = await requireApplicationReadAccess(request, reply, arn, "You are not allowed to access this application");
    if (!internalArn) return;

    const application = await applications.getApplication(internalArn);
    if (!application) return send404(reply, "APPLICATION_NOT_FOUND");

    const auditResult = await query(
      `SELECT ae.event_type, ae.actor_type, ae.actor_id, u.name as actor_name, ae.payload_jsonb, ae.created_at
       FROM audit_event ae LEFT JOIN "user" u ON ae.actor_id = u.user_id
       WHERE ae.arn = $1 ORDER BY ae.created_at DESC LIMIT 50`,
      [internalArn]
    );

    const timeline = auditResult.rows.map((r: any) => ({
      event_type: r.event_type,
      actor_name: r.actor_name,
      created_at: r.created_at,
      payload: r.payload_jsonb,
    }));

    const summary = await summarizeTimeline(timeline, application.state_id, application.service_key);
    return { summary };
  });
}
