import { query } from "./db";
import { getApplicantSectionRequiredFields } from "./service-pack-shared";

export type ApplicantProfile = Record<string, any>;
const APPLICANT_ALLOWED_FIELDS = new Set([
  "salutation",
  "first_name",
  "middle_name",
  "last_name",
  "full_name",
  "father_name",
  "gender",
  "marital_status",
  "date_of_birth",
  "aadhaar",
  "pan",
  "email",
  "mobile",
]);

export async function getUserProfile(userId: string): Promise<any> {
  const result = await query('SELECT profile_jsonb FROM "user" WHERE user_id = $1', [userId]);
  return result.rows[0]?.profile_jsonb || {};
}

export async function getApplicantProfile(userId: string): Promise<ApplicantProfile> {
  const profile = await getUserProfile(userId);
  if (profile && typeof profile === "object" && profile.applicant) {
    return profile.applicant;
  }
  return {};
}

export function checkApplicantProfileCompleteness(applicant: ApplicantProfile): { isComplete: boolean; missingFields: string[] } {
  const required = getApplicantSectionRequiredFields();
  const missing = required.filter((fieldKey) => {
    const path = fieldKey.replace(/^applicant\./, "").split(".");
    let value: any = applicant;
    for (const key of path) {
      value = value?.[key];
    }
    return value === undefined || value === null || value === "";
  });
  return { isComplete: missing.length === 0, missingFields: missing };
}

export async function ensureApplicantProfileComplete(userId: string): Promise<ApplicantProfile> {
  const applicant = await getApplicantProfile(userId);
  const { isComplete, missingFields } = checkApplicantProfileCompleteness(applicant);
  if (!isComplete) {
    const error = new Error(`PROFILE_INCOMPLETE:${missingFields.join(",")}`);
    throw error;
  }
  return applicant;
}

function sanitizeApplicantPatch(patch: ApplicantProfile): ApplicantProfile {
  const sanitized: ApplicantProfile = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!APPLICANT_ALLOWED_FIELDS.has(key)) continue;
    if (typeof value === "string") {
      sanitized[key] = value.trim();
      continue;
    }
    if (value === null || value === undefined) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export async function updateApplicantProfile(
  userId: string,
  patch: ApplicantProfile
): Promise<ApplicantProfile> {
  const sanitized = sanitizeApplicantPatch(patch);
  if (Object.keys(sanitized).length === 0) {
    return getApplicantProfile(userId);
  }

  await query(
    `UPDATE "user"
     SET profile_jsonb =
       jsonb_set(
         COALESCE(profile_jsonb, '{}'::jsonb),
         '{applicant}',
         COALESCE(profile_jsonb->'applicant', '{}'::jsonb) || $2::jsonb,
         true
       )
     WHERE user_id = $1`,
    [userId, JSON.stringify(sanitized)]
  );

  return getApplicantProfile(userId);
}
