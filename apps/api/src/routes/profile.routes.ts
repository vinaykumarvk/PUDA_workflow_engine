import { FastifyInstance } from "fastify";
import { getAuthUserId, send400 } from "../errors";
import {
  getApplicantProfile,
  checkApplicantProfileCompleteness,
  updateApplicantProfile,
} from "../profile";

const profileMeSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const patchProfileSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["applicant"],
    properties: {
      applicant: {
        type: "object",
        additionalProperties: false,
        properties: {
          salutation: { type: "string" },
          first_name: { type: "string" },
          middle_name: { type: "string" },
          last_name: { type: "string" },
          full_name: { type: "string" },
          father_name: { type: "string" },
          gender: { type: "string" },
          marital_status: { type: "string" },
          date_of_birth: { type: "string" },
          aadhaar: { type: "string" },
          pan: { type: "string" },
          email: { type: "string" },
          mobile: { type: "string" },
        },
      },
    },
  },
};

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/v1/profile/me", { schema: profileMeSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");

    const applicant = await getApplicantProfile(userId);
    const completeness = checkApplicantProfileCompleteness(applicant);
    return { applicant, completeness };
  });

  app.patch("/api/v1/profile/me", { schema: patchProfileSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");

    const body = request.body as { applicant?: Record<string, unknown> };
    if (!body?.applicant || typeof body.applicant !== "object") {
      return send400(reply, "INVALID_PROFILE_PATCH", "applicant object is required");
    }

    const applicant = await updateApplicantProfile(userId, body.applicant);
    const completeness = checkApplicantProfileCompleteness(applicant);
    return { applicant, completeness };
  });
}
