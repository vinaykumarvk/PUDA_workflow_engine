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

// ---------------------------------------------------------------------------
// Address profile
// ---------------------------------------------------------------------------

export type AddressProfile = {
  permanent?: Record<string, any>;
  communication?: Record<string, any>;
};

const ADDRESS_ALLOWED_FIELDS = new Set([
  "line1",
  "line2",
  "city",
  "state",
  "district",
  "pincode",
]);

const COMMUNICATION_EXTRA_FIELDS = new Set(["same_as_permanent"]);

function sanitizeAddressBlock(
  block: Record<string, any>,
  allowSameAsPermanent: boolean
): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(block || {})) {
    if (ADDRESS_ALLOWED_FIELDS.has(key)) {
      if (typeof value === "string") {
        sanitized[key] = value.trim();
      } else if (value === null) {
        sanitized[key] = null;
      }
      continue;
    }
    if (allowSameAsPermanent && COMMUNICATION_EXTRA_FIELDS.has(key)) {
      if (typeof value === "boolean") {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}

function sanitizeAddressPatch(patch: AddressProfile): AddressProfile {
  const sanitized: AddressProfile = {};
  if (patch.permanent && typeof patch.permanent === "object") {
    sanitized.permanent = sanitizeAddressBlock(patch.permanent, false);
  }
  if (patch.communication && typeof patch.communication === "object") {
    sanitized.communication = sanitizeAddressBlock(patch.communication, true);
  }
  return sanitized;
}

export async function getAddressProfile(userId: string): Promise<AddressProfile> {
  const profile = await getUserProfile(userId);
  if (profile && typeof profile === "object" && profile.addresses) {
    return profile.addresses;
  }
  return {};
}

export async function updateAddressProfile(
  userId: string,
  patch: AddressProfile
): Promise<AddressProfile> {
  const sanitized = sanitizeAddressPatch(patch);
  if (
    Object.keys(sanitized).length === 0 ||
    ((!sanitized.permanent || Object.keys(sanitized.permanent).length === 0) &&
      (!sanitized.communication || Object.keys(sanitized.communication).length === 0))
  ) {
    return getAddressProfile(userId);
  }

  await query(
    `UPDATE "user"
     SET profile_jsonb =
       jsonb_set(
         COALESCE(profile_jsonb, '{}'::jsonb),
         '{addresses}',
         COALESCE(profile_jsonb->'addresses', '{}'::jsonb) || $2::jsonb,
         true
       )
     WHERE user_id = $1`,
    [userId, JSON.stringify(sanitized)]
  );

  return getAddressProfile(userId);
}

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export type UserPreferences = Record<string, unknown>;

const PREFERENCES_ALLOWED_FIELDS = new Set([
  "theme",
  "sidebarCollapsed",
  "defaultLandingPage",
  "reduceAnimations",
  "language",
  "dateFormat",
]);

const PREFERENCES_VALID_VALUES: Record<string, string[] | "boolean"> = {
  theme: ["light", "dark", "system"],
  sidebarCollapsed: "boolean",
  defaultLandingPage: ["dashboard", "services", "applications", "locker"],
  reduceAnimations: "boolean",
  language: ["hi", "pa", "none"],
  dateFormat: ["DD/MM/YYYY", "YYYY-MM-DD"],
};

function sanitizePreferencesPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!PREFERENCES_ALLOWED_FIELDS.has(key)) continue;
    const allowed = PREFERENCES_VALID_VALUES[key];
    if (allowed === "boolean") {
      if (typeof value === "boolean") sanitized[key] = value;
    } else if (Array.isArray(allowed)) {
      if (typeof value === "string" && allowed.includes(value)) sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const profile = await getUserProfile(userId);
  if (profile && typeof profile === "object" && profile.preferences) {
    return profile.preferences;
  }
  return {};
}

export async function updatePreferences(
  userId: string,
  patch: Record<string, unknown>
): Promise<UserPreferences> {
  const sanitized = sanitizePreferencesPatch(patch);
  if (Object.keys(sanitized).length === 0) {
    return getPreferences(userId);
  }

  await query(
    `UPDATE "user"
     SET profile_jsonb =
       jsonb_set(
         COALESCE(profile_jsonb, '{}'::jsonb),
         '{preferences}',
         COALESCE(profile_jsonb->'preferences', '{}'::jsonb) || $2::jsonb,
         true
       ),
       preferences_updated_at = NOW()
     WHERE user_id = $1`,
    [userId, JSON.stringify(sanitized)]
  );

  return getPreferences(userId);
}

// ---------------------------------------------------------------------------
// Verification data
// ---------------------------------------------------------------------------

export type VerificationData = {
  aadhaar_verified?: boolean;
  aadhaar_verified_at?: string;
  pan_verified?: boolean;
  pan_verified_at?: string;
  onboarding_completed_at?: string;
};

export async function getVerification(userId: string): Promise<VerificationData> {
  const profile = await getUserProfile(userId);
  if (profile && typeof profile === "object" && profile.verification) {
    return profile.verification;
  }
  return {};
}

export async function updateVerification(
  userId: string,
  patch: Partial<VerificationData>
): Promise<VerificationData> {
  if (Object.keys(patch).length === 0) {
    return getVerification(userId);
  }

  await query(
    `UPDATE "user"
     SET profile_jsonb =
       jsonb_set(
         COALESCE(profile_jsonb, '{}'::jsonb),
         '{verification}',
         COALESCE(profile_jsonb->'verification', '{}'::jsonb) || $2::jsonb,
         true
       )
     WHERE user_id = $1`,
    [userId, JSON.stringify(patch)]
  );

  return getVerification(userId);
}

// ---------------------------------------------------------------------------
// Enhanced profile completeness (sections + percentage)
// ---------------------------------------------------------------------------

export interface ProfileSection {
  complete: boolean;
  fields: string[]; // missing field names
}

export interface ProfileCompleteness {
  isComplete: boolean;
  completionPercent: number;
  missingFields: string[];
  sections: {
    identity: ProfileSection;
    personal: ProfileSection;
    contact: ProfileSection;
    address: ProfileSection;
  };
  verification: VerificationData;
}

const IDENTITY_FIELDS = ["aadhaar", "pan"];
const PERSONAL_FIELDS = ["full_name", "date_of_birth", "gender", "marital_status", "father_name"];
const CONTACT_FIELDS = ["email", "mobile"];
const ADDRESS_FIELDS = ["line1", "city", "state", "district", "pincode"];

// Weights for % calculation
const SECTION_WEIGHTS = { identity: 30, personal: 30, contact: 15, address: 25 };

function checkFieldsPresent(data: Record<string, any>, fields: string[]): string[] {
  return fields.filter((f) => {
    const v = data?.[f];
    return v === undefined || v === null || v === "";
  });
}

export async function getEnhancedCompleteness(userId: string): Promise<ProfileCompleteness> {
  const profile = await getUserProfile(userId);
  const applicant = (profile?.applicant as Record<string, any>) || {};
  const addresses = (profile?.addresses as AddressProfile) || {};
  const verification = (profile?.verification as VerificationData) || {};
  const permanentAddr = (addresses.permanent as Record<string, any>) || {};

  const identityMissing = checkFieldsPresent(applicant, IDENTITY_FIELDS);
  const personalMissing = checkFieldsPresent(applicant, PERSONAL_FIELDS);
  const contactMissing = checkFieldsPresent(applicant, CONTACT_FIELDS);
  const addressMissing = checkFieldsPresent(permanentAddr, ADDRESS_FIELDS);

  const sections = {
    identity: { complete: identityMissing.length === 0, fields: identityMissing },
    personal: { complete: personalMissing.length === 0, fields: personalMissing },
    contact: { complete: contactMissing.length === 0, fields: contactMissing },
    address: { complete: addressMissing.length === 0, fields: addressMissing },
  };

  // Weighted percentage
  let percent = 0;
  for (const [key, weight] of Object.entries(SECTION_WEIGHTS)) {
    const section = sections[key as keyof typeof sections];
    const sectionKey = key as keyof typeof sections;
    const totalFields =
      sectionKey === "identity" ? IDENTITY_FIELDS.length
        : sectionKey === "personal" ? PERSONAL_FIELDS.length
          : sectionKey === "contact" ? CONTACT_FIELDS.length
            : ADDRESS_FIELDS.length;
    const filledCount = totalFields - section.fields.length;
    percent += (filledCount / totalFields) * weight;
  }

  const missingFields = [
    ...identityMissing,
    ...personalMissing,
    ...contactMissing,
    ...addressMissing.map((f) => `address.${f}`),
  ];

  return {
    isComplete: missingFields.length === 0,
    completionPercent: Math.round(percent),
    missingFields,
    sections,
    verification,
  };
}
