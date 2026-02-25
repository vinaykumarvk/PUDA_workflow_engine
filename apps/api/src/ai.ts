/**
 * AI utilities for the PUDA workflow engine.
 * Proxies requests to OpenAI GPT API for complaint parsing and timeline summaries.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

async function callOpenAI(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export interface ParsedComplaint {
  violationType: string | null;
  subject: string | null;
  description: string;
  locationLocality: string | null;
  locationCity: string | null;
  confidence: number;
}

export async function parseComplaint(
  transcript: string,
  language: "hi" | "en" | "pa"
): Promise<ParsedComplaint> {
  const systemPrompt = `You are a complaint parser for PUDA (Punjab Urban Development Authority).
Given a voice transcript about a construction violation, extract:
1. violation_type: one of [UNAUTHORIZED_CONSTRUCTION, PLAN_DEVIATION, ENCROACHMENT, HEIGHT_VIOLATION, SETBACK_VIOLATION, CHANGE_OF_USE, UNAUTHORIZED_COLONY, OTHER]
2. subject: one-line summary (max 100 chars)
3. description: cleaned, grammatically correct version of the transcript
4. location_locality: sector/locality if mentioned (e.g. "Sector 20", "Phase 7")
5. location_city: city if mentioned
6. confidence: 0-1 score of how confident you are in the extraction

The transcript may be in ${language === "hi" ? "Hindi" : language === "pa" ? "Punjabi" : "English"}.
Return JSON only, no markdown formatting.`;

  const raw = await callOpenAI(systemPrompt, transcript);

  try {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      violationType: parsed.violation_type || null,
      subject: parsed.subject || null,
      description: parsed.description || transcript,
      locationLocality: parsed.location_locality || null,
      locationCity: parsed.location_city || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    return {
      violationType: null,
      subject: null,
      description: transcript,
      locationLocality: null,
      locationCity: null,
      confidence: 0,
    };
  }
}

export interface TimelineEvent {
  event_type: string;
  actor_name?: string;
  created_at: string;
  payload?: any;
}

export async function summarizeTimeline(
  timeline: TimelineEvent[],
  currentState: string,
  serviceKey: string
): Promise<string> {
  const systemPrompt = `Summarize this government application's progress for a citizen in simple, reassuring language.
Mention key dates and who handled the file. Keep it to 2-3 sentences.
Service type: ${serviceKey}. Current state: ${currentState}.`;

  const eventsText = timeline
    .slice(0, 15)
    .map((e) => {
      const date = new Date(e.created_at).toLocaleDateString("en-IN");
      const actor = e.actor_name || e.payload?.actor_type || "System";
      return `${date}: ${e.event_type} by ${actor}`;
    })
    .join("\n");

  return callOpenAI(systemPrompt, eventsText);
}

export function isAIConfigured(): boolean {
  return Boolean(OPENAI_API_KEY);
}
