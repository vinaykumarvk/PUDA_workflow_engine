import { FastifyInstance } from "fastify";
import { query } from "../db";
import { getAuthUserId, send400 } from "../errors";
import {
  getApplicantProfile,
  getAddressProfile,
  checkApplicantProfileCompleteness,
  updateApplicantProfile,
  updateAddressProfile,
  getPreferences,
  updatePreferences,
  getVerification,
  updateVerification,
  getEnhancedCompleteness,
} from "../profile";
import { resolveAadhaarEkycAdapter } from "../providers/aadhaar-ekyc";
import { resolvePanVerifyAdapter } from "../providers/pan-verify";

const profileMeSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: { type: "string", minLength: 1 }, // test-mode fallback only
    },
  },
};

const addressBlockSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    line1: { type: ["string", "null"] },
    line2: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    district: { type: ["string", "null"] },
    pincode: { type: ["string", "null"] },
  },
};

const communicationAddressSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    same_as_permanent: { type: "boolean" },
    line1: { type: ["string", "null"] },
    line2: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    district: { type: ["string", "null"] },
    pincode: { type: ["string", "null"] },
  },
};

const patchProfileSchema = {
  body: {
    type: "object",
    additionalProperties: false,
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
      addresses: {
        type: "object",
        additionalProperties: false,
        properties: {
          permanent: addressBlockSchema,
          communication: communicationAddressSchema,
        },
      },
      preferences: {
        type: "object",
        additionalProperties: false,
        properties: {
          theme: { type: "string", enum: ["light", "dark", "system"] },
          sidebarCollapsed: { type: "boolean" },
          defaultLandingPage: { type: "string", enum: ["dashboard", "services", "applications", "locker"] },
          reduceAnimations: { type: "boolean" },
          language: { type: "string", enum: ["hi", "pa", "none"] },
          dateFormat: { type: "string", enum: ["DD/MM/YYYY", "YYYY-MM-DD"] },
        },
      },
      verification: {
        type: "object",
        additionalProperties: false,
        properties: {
          onboarding_completed_at: { type: "string" },
        },
      },
    },
  },
};

const aadhaarSendOtpSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["aadhaar"],
    properties: {
      aadhaar: { type: "string", minLength: 12, maxLength: 12, pattern: "^\\d{12}$" },
    },
  },
};

const aadhaarVerifySchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["aadhaar", "otp", "txnId"],
    properties: {
      aadhaar: { type: "string", minLength: 12, maxLength: 12, pattern: "^\\d{12}$" },
      otp: { type: "string", minLength: 4, maxLength: 8 },
      txnId: { type: "string", minLength: 1 },
    },
  },
};

const panVerifySchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["pan"],
    properties: {
      pan: { type: "string", minLength: 10, maxLength: 10, pattern: "^[A-Za-z]{5}[0-9]{4}[A-Za-z]$" },
    },
  },
};

export async function registerProfileRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // GET /api/v1/profile/me — enhanced with completeness sections + verification
  // -------------------------------------------------------------------------
  app.get("/api/v1/profile/me", { schema: profileMeSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");

    const [applicant, addresses, preferences, enhanced] = await Promise.all([
      getApplicantProfile(userId),
      getAddressProfile(userId),
      getPreferences(userId),
      getEnhancedCompleteness(userId),
    ]);

    // Keep backward-compatible `completeness` key + add enhanced fields
    const completeness = checkApplicantProfileCompleteness(applicant);

    const tsResult = await query('SELECT preferences_updated_at FROM "user" WHERE user_id = $1', [userId]);
    const preferencesUpdatedAt = tsResult.rows[0]?.preferences_updated_at || null;

    return {
      applicant,
      addresses,
      completeness: {
        ...completeness,
        completionPercent: enhanced.completionPercent,
        sections: enhanced.sections,
      },
      verification: enhanced.verification,
      preferences,
      preferencesUpdatedAt,
    };
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/profile/me — now also accepts verification section
  // -------------------------------------------------------------------------
  app.patch("/api/v1/profile/me", { schema: patchProfileSchema }, async (request, reply) => {
    const userId = getAuthUserId(request, "userId");
    if (!userId) return send400(reply, "USER_ID_REQUIRED");

    const body = request.body as {
      applicant?: Record<string, unknown>;
      addresses?: { permanent?: Record<string, unknown>; communication?: Record<string, unknown> };
      preferences?: Record<string, unknown>;
      verification?: { onboarding_completed_at?: string };
    };
    if (!body?.applicant && !body?.addresses && !body?.preferences && !body?.verification) {
      return send400(reply, "INVALID_PROFILE_PATCH", "applicant, addresses, preferences, or verification object is required");
    }

    let applicant = await getApplicantProfile(userId);
    if (body.applicant && typeof body.applicant === "object") {
      applicant = await updateApplicantProfile(userId, body.applicant);
    }

    let addresses = await getAddressProfile(userId);
    if (body.addresses && typeof body.addresses === "object") {
      addresses = await updateAddressProfile(userId, body.addresses);
    }

    let preferences = await getPreferences(userId);
    if (body.preferences && typeof body.preferences === "object") {
      preferences = await updatePreferences(userId, body.preferences);
    }

    if (body.verification && typeof body.verification === "object") {
      await updateVerification(userId, body.verification);
    }

    const enhanced = await getEnhancedCompleteness(userId);
    const completeness = checkApplicantProfileCompleteness(applicant);

    const tsResult = await query('SELECT preferences_updated_at FROM "user" WHERE user_id = $1', [userId]);
    const preferencesUpdatedAt = tsResult.rows[0]?.preferences_updated_at || null;

    return {
      applicant,
      addresses,
      completeness: {
        ...completeness,
        completionPercent: enhanced.completionPercent,
        sections: enhanced.sections,
      },
      verification: enhanced.verification,
      preferences,
      preferencesUpdatedAt,
    };
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/profile/ekyc/aadhaar/send-otp
  // -------------------------------------------------------------------------
  app.post(
    "/api/v1/profile/ekyc/aadhaar/send-otp",
    { schema: aadhaarSendOtpSchema },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const { aadhaar } = request.body as { aadhaar: string };
      const adapter = resolveAadhaarEkycAdapter();
      const result = await adapter.sendOtp(aadhaar);

      if (!result.success) {
        return reply.status(400).send({ error: "EKYC_OTP_FAILED", message: result.message });
      }
      return { success: true, message: result.message, txnId: result.txnId };
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/profile/ekyc/aadhaar/verify
  // -------------------------------------------------------------------------
  app.post(
    "/api/v1/profile/ekyc/aadhaar/verify",
    { schema: aadhaarVerifySchema },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const { aadhaar, otp, txnId } = request.body as { aadhaar: string; otp: string; txnId: string };
      const adapter = resolveAadhaarEkycAdapter();
      const result = await adapter.verifyOtpAndFetchDemographics(aadhaar, otp, txnId);

      if (!result.verified || !result.demographics) {
        return reply.status(400).send({ error: "EKYC_VERIFY_FAILED", message: result.error || "Verification failed" });
      }

      const demo = result.demographics;

      // Auto-update applicant profile with Aadhaar-fetched fields
      await updateApplicantProfile(userId, {
        full_name: demo.full_name,
        date_of_birth: demo.date_of_birth,
        gender: demo.gender,
        aadhaar,
      });

      // Auto-update permanent address
      await updateAddressProfile(userId, {
        permanent: demo.address,
      });

      // Set verification flags
      const now = new Date().toISOString();
      await updateVerification(userId, {
        aadhaar_verified: true,
        aadhaar_verified_at: now,
      });

      // Return updated profile data
      const [applicant, addresses, enhanced] = await Promise.all([
        getApplicantProfile(userId),
        getAddressProfile(userId),
        getEnhancedCompleteness(userId),
      ]);

      return {
        verified: true,
        demographics: demo,
        applicant,
        addresses,
        completeness: {
          completionPercent: enhanced.completionPercent,
          sections: enhanced.sections,
          isComplete: enhanced.isComplete,
          missingFields: enhanced.missingFields,
        },
        verification: enhanced.verification,
      };
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/profile/verify/pan
  // -------------------------------------------------------------------------
  app.post(
    "/api/v1/profile/verify/pan",
    { schema: panVerifySchema },
    async (request, reply) => {
      const userId = getAuthUserId(request, "userId");
      if (!userId) return send400(reply, "USER_ID_REQUIRED");

      const { pan } = request.body as { pan: string };
      const upperPan = pan.toUpperCase();

      // Get current profile name for matching
      const applicant = await getApplicantProfile(userId);
      const profileName = applicant.full_name || `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim();

      const adapter = resolvePanVerifyAdapter();
      const result = await adapter.verify(upperPan, profileName);

      if (!result.valid) {
        return reply.status(400).send({ error: "PAN_VERIFY_FAILED", message: result.error || "PAN verification failed" });
      }

      // Update PAN in profile + set verification flags
      await updateApplicantProfile(userId, { pan: upperPan });
      const now = new Date().toISOString();
      await updateVerification(userId, {
        pan_verified: true,
        pan_verified_at: now,
      });

      const enhanced = await getEnhancedCompleteness(userId);

      return {
        valid: true,
        registered_name: result.registered_name,
        name_match_score: result.name_match_score,
        verification: enhanced.verification,
        completeness: {
          completionPercent: enhanced.completionPercent,
          sections: enhanced.sections,
          isComplete: enhanced.isComplete,
          missingFields: enhanced.missingFields,
        },
      };
    }
  );
}
