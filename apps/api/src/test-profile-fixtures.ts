import { query } from "./db";
import { getApplicantSectionRequiredFields } from "./service-pack-shared";

const DEFAULT_TEST_CITIZEN_IDS = [
  "test-citizen-1",
  "test-citizen-2",
  "test-citizen-3",
  "test-citizen-4",
  "test-citizen-5",
];

type UserRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_jsonb: unknown;
};

function toDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function toPan(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized) ? normalized : null;
}

function toIsoDate(value: string): string | null {
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function parseNameParts(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Test", lastName: "Citizen" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Citizen" };
  }
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

function defaultAadhaar(seedIndex: number): string {
  return `9${String(seedIndex + 1).padStart(11, "0")}`;
}

function defaultMobile(seedIndex: number): string {
  return `9${String(seedIndex + 1).padStart(9, "0")}`;
}

function defaultPan(seedIndex: number): string {
  return `PUDAT${String(seedIndex + 1).padStart(4, "0")}A`;
}

function getNestedValue(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setNestedValue(root: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  let current: Record<string, unknown> = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}

function normalizeApplicantProfile(
  user: UserRow,
  seedIndex: number
): Record<string, unknown> {
  const existingProfile =
    user.profile_jsonb && typeof user.profile_jsonb === "object"
      ? (user.profile_jsonb as Record<string, unknown>)
      : {};
  const existingApplicant =
    existingProfile.applicant &&
    typeof existingProfile.applicant === "object" &&
    !Array.isArray(existingProfile.applicant)
      ? { ...(existingProfile.applicant as Record<string, unknown>) }
      : {};

  const fullNameCandidate =
    typeof existingApplicant.full_name === "string" && existingApplicant.full_name.trim().length > 0
      ? existingApplicant.full_name.trim()
      : user.name?.trim() || `Test Citizen ${seedIndex + 1}`;
  const { firstName, lastName } = parseNameParts(fullNameCandidate);

  const aadhaarCandidate =
    typeof existingApplicant.aadhaar === "string"
      ? toDigits(existingApplicant.aadhaar)
      : toDigits(user.phone || "");
  const mobileCandidate =
    typeof existingApplicant.mobile === "string"
      ? toDigits(existingApplicant.mobile)
      : toDigits(user.phone || "");
  const panCandidate =
    typeof existingApplicant.pan === "string" ? toPan(existingApplicant.pan) : null;
  const dobCandidate =
    typeof existingApplicant.date_of_birth === "string"
      ? toIsoDate(existingApplicant.date_of_birth)
      : null;
  const emailCandidate =
    typeof existingApplicant.email === "string" && existingApplicant.email.trim().length > 0
      ? existingApplicant.email.trim()
      : user.email?.trim() || `citizen${seedIndex + 1}@test.puda.gov.in`;

  const applicant: Record<string, unknown> = {
    ...existingApplicant,
    first_name:
      (typeof existingApplicant.first_name === "string" &&
        existingApplicant.first_name.trim().length > 0 &&
        existingApplicant.first_name.trim()) ||
      firstName,
    last_name:
      (typeof existingApplicant.last_name === "string" &&
        existingApplicant.last_name.trim().length > 0 &&
        existingApplicant.last_name.trim()) ||
      lastName,
    full_name: fullNameCandidate,
    father_name:
      (typeof existingApplicant.father_name === "string" &&
        existingApplicant.father_name.trim().length > 0 &&
        existingApplicant.father_name.trim()) ||
      `Father of ${firstName}`,
    gender:
      (typeof existingApplicant.gender === "string" &&
        existingApplicant.gender.trim().length > 0 &&
        existingApplicant.gender.trim()) ||
      "MALE",
    marital_status:
      (typeof existingApplicant.marital_status === "string" &&
        existingApplicant.marital_status.trim().length > 0 &&
        existingApplicant.marital_status.trim()) ||
      "MARRIED",
    date_of_birth: dobCandidate || "1990-01-01",
    aadhaar:
      aadhaarCandidate.length === 12
        ? aadhaarCandidate
        : aadhaarCandidate.length > 12
          ? aadhaarCandidate.slice(-12)
          : defaultAadhaar(seedIndex),
    pan: panCandidate || defaultPan(seedIndex),
    email: emailCandidate,
    mobile:
      mobileCandidate.length === 10
        ? mobileCandidate
        : mobileCandidate.length > 10
          ? mobileCandidate.slice(-10)
          : defaultMobile(seedIndex),
  };

  const requiredFields = getApplicantSectionRequiredFields();
  for (const fieldPath of requiredFields) {
    const path = fieldPath.replace(/^applicant\./, "").split(".");
    const existingValue = getNestedValue(applicant, path);
    const missing =
      existingValue === undefined ||
      existingValue === null ||
      (typeof existingValue === "string" && existingValue.trim().length === 0);
    if (!missing) continue;
    setNestedValue(applicant, path, `test_${path.join("_")}_${seedIndex + 1}`);
  }

  return {
    ...existingProfile,
    applicant,
  };
}

export async function seedCompleteApplicantProfilesForTests(
  userIds: string[] = DEFAULT_TEST_CITIZEN_IDS
): Promise<void> {
  if (userIds.length === 0) return;
  const users = await query(
    `SELECT user_id, name, email, phone, profile_jsonb
     FROM "user"
     WHERE user_type = 'CITIZEN'
       AND user_id = ANY($1::text[])`,
    [userIds]
  ) as { rows?: UserRow[] } | undefined;
  if (!users || !Array.isArray(users.rows)) {
    return;
  }
  const rows = users.rows;
  for (const [index, user] of rows.entries()) {
    const nextProfile = normalizeApplicantProfile(user, index);
    await query(
      `UPDATE "user"
       SET profile_jsonb = $2::jsonb
       WHERE user_id = $1`,
      [user.user_id, JSON.stringify(nextProfile)]
    );
  }
}
