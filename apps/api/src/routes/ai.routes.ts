import type { FastifyInstance } from "fastify";
import { parseComplaint, summarizeTimeline, isAIConfigured } from "../ai";

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

  // Summarize application timeline
  app.post("/api/v1/ai/summarize-timeline", {
    schema: {
      body: {
        type: "object",
        required: ["timeline", "currentState", "serviceKey"],
        additionalProperties: false,
        properties: {
          timeline: {
            type: "array",
            items: {
              type: "object",
              properties: {
                event_type: { type: "string" },
                actor_name: { type: "string" },
                created_at: { type: "string" },
                payload: {},
              },
            },
          },
          currentState: { type: "string" },
          serviceKey: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    if (!isAIConfigured()) {
      reply.code(503);
      return { error: "AI_NOT_CONFIGURED", message: "AI features are not available" };
    }

    const { timeline, currentState, serviceKey } = request.body as {
      timeline: Array<{ event_type: string; actor_name?: string; created_at: string; payload?: any }>;
      currentState: string;
      serviceKey: string;
    };

    const summary = await summarizeTimeline(timeline, currentState, serviceKey);
    return { summary };
  });
}
