import { parse } from "yaml";

export type SubmissionEnforcementMode = "warn" | "enforce";

export type ServiceMetadata = {
  serviceKey: string;
  displayName: string;
  category: string;
  description: string;
  applicableAuthorities: string[];
  sla: {
    totalDays: number;
    calendarType: string;
    workingCalendar: string;
  };
  applicantTypes: string[];
  physicalDocumentRequired: boolean;
  physicalVerificationRequired: boolean;
  submissionValidation: {
    propertyRequired: boolean;
    enforcementMode: SubmissionEnforcementMode;
  };
  version?: string;
};

const TOP_LEVEL_KEYS = [
  "serviceKey",
  "displayName",
  "category",
  "description",
  "applicableAuthorities",
  "sla",
  "applicantTypes",
  "physicalDocumentRequired",
  "physicalVerificationRequired",
  "submissionValidation",
  "version",
] as const;

const SLA_KEYS = ["totalDays", "calendarType", "workingCalendar"] as const;
const SUBMISSION_VALIDATION_KEYS = ["propertyRequired", "enforcementMode"] as const;

export class ServiceMetadataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceMetadataValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertStrictObject(
  value: unknown,
  context: string,
  requiredKeys: readonly string[],
  optionalKeys: ReadonlySet<string> = new Set()
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ServiceMetadataValidationError(`${context} must be an object`);
  }

  const keys = Object.keys(value);
  const unknownKeys = keys.filter((key) => !requiredKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new ServiceMetadataValidationError(
      `${context} has unknown keys: ${unknownKeys.join(", ")}`
    );
  }

  const missingKeys = requiredKeys.filter((key) => !optionalKeys.has(key) && !(key in value));
  if (missingKeys.length > 0) {
    throw new ServiceMetadataValidationError(
      `${context} is missing required keys: ${missingKeys.join(", ")}`
    );
  }
}

function assertNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ServiceMetadataValidationError(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function assertStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ServiceMetadataValidationError(`${context} must be a non-empty string[]`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new ServiceMetadataValidationError(
        `${context}[${index}] must be a non-empty string`
      );
    }
    return entry.trim();
  });
}

function assertBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new ServiceMetadataValidationError(`${context} must be a boolean`);
  }
  return value;
}

function assertPositiveInteger(value: unknown, context: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new ServiceMetadataValidationError(`${context} must be a positive integer`);
  }
  return Number(value);
}

function validateServiceKey(value: unknown, context: string): string {
  const serviceKey = assertNonEmptyString(value, context);
  if (!/^[a-z0-9_]+$/.test(serviceKey)) {
    throw new ServiceMetadataValidationError(
      `${context} must match ^[a-z0-9_]+$`
    );
  }
  return serviceKey;
}

export function validateServiceMetadata(
  value: unknown,
  sourceLabel: string,
  options?: { expectedServiceKey?: string }
): ServiceMetadata {
  const context = `[SERVICE_METADATA_INVALID] ${sourceLabel}`;
  assertStrictObject(value, context, TOP_LEVEL_KEYS, new Set(["version"]));

  const serviceKey = validateServiceKey(value.serviceKey, `${context}.serviceKey`);
  if (options?.expectedServiceKey && serviceKey !== options.expectedServiceKey) {
    throw new ServiceMetadataValidationError(
      `${context}.serviceKey (${serviceKey}) must match directory name (${options.expectedServiceKey})`
    );
  }

  const displayName = assertNonEmptyString(value.displayName, `${context}.displayName`);
  const category = assertNonEmptyString(value.category, `${context}.category`);
  const description = assertNonEmptyString(value.description, `${context}.description`);
  const applicableAuthorities = assertStringArray(
    value.applicableAuthorities,
    `${context}.applicableAuthorities`
  );
  const applicantTypes = assertStringArray(value.applicantTypes, `${context}.applicantTypes`);
  const physicalDocumentRequired = assertBoolean(
    value.physicalDocumentRequired,
    `${context}.physicalDocumentRequired`
  );
  const physicalVerificationRequired = assertBoolean(
    value.physicalVerificationRequired,
    `${context}.physicalVerificationRequired`
  );

  assertStrictObject(value.sla, `${context}.sla`, SLA_KEYS);
  const sla = {
    totalDays: assertPositiveInteger(value.sla.totalDays, `${context}.sla.totalDays`),
    calendarType: assertNonEmptyString(value.sla.calendarType, `${context}.sla.calendarType`),
    workingCalendar: assertNonEmptyString(
      value.sla.workingCalendar,
      `${context}.sla.workingCalendar`
    ),
  };

  assertStrictObject(
    value.submissionValidation,
    `${context}.submissionValidation`,
    SUBMISSION_VALIDATION_KEYS
  );
  const submissionValidation = {
    propertyRequired: assertBoolean(
      value.submissionValidation.propertyRequired,
      `${context}.submissionValidation.propertyRequired`
    ),
    enforcementMode: assertNonEmptyString(
      value.submissionValidation.enforcementMode,
      `${context}.submissionValidation.enforcementMode`
    ) as SubmissionEnforcementMode,
  };
  if (!["warn", "enforce"].includes(submissionValidation.enforcementMode)) {
    throw new ServiceMetadataValidationError(
      `${context}.submissionValidation.enforcementMode must be one of: warn, enforce`
    );
  }

  const version =
    typeof value.version === "string" && value.version.trim()
      ? value.version.trim()
      : undefined;

  return {
    serviceKey,
    displayName,
    category,
    description,
    applicableAuthorities,
    sla,
    applicantTypes,
    physicalDocumentRequired,
    physicalVerificationRequired,
    submissionValidation,
    version,
  };
}

export function parseServiceMetadataYaml(
  rawYaml: string,
  sourceLabel: string,
  options?: { expectedServiceKey?: string }
): ServiceMetadata {
  let parsed: unknown;
  try {
    parsed = parse(rawYaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new ServiceMetadataValidationError(
      `[SERVICE_METADATA_INVALID] ${sourceLabel} contains invalid YAML: ${message}`
    );
  }

  return validateServiceMetadata(parsed, sourceLabel, options);
}
