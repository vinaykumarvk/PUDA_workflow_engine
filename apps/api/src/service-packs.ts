import { promises as fs } from "fs";
import path from "path";
import { applySharedFormSections } from "./service-pack-shared";
import { parseServiceMetadataYaml, ServiceMetadata } from "./service-metadata";

type ServiceSummary = ServiceMetadata;

const servicePackRoot = path.resolve(__dirname, "..", "..", "..", "service-packs");
const IGNORED_SERVICE_PACK_DIRECTORIES = new Set(["_shared"]);

export class ServicePackNotFoundError extends Error {
  constructor(serviceKey: string) {
    super(`Service pack not found: ${serviceKey}`);
    this.name = "ServicePackNotFoundError";
  }
}

export function isServicePackNotFoundError(error: unknown): error is ServicePackNotFoundError {
  return error instanceof ServicePackNotFoundError;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error) && typeof error === "object" && "code" in (error as Record<string, unknown>);
}

async function readOptionalJson(filePath: string): Promise<unknown | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`[SERVICE_PACK_INVALID] ${filePath} contains invalid JSON: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Form field type validation — must stay in sync with FormRenderer switch cases
// ---------------------------------------------------------------------------
const SUPPORTED_FIELD_TYPES = new Set([
  "string", "text", "textarea", "number", "date",
  "email", "phone", "aadhaar", "boolean", "enum",
]);

function validateFormFieldTypes(form: any, serviceKey: string): void {
  if (!form?.pages || !Array.isArray(form.pages)) return;
  const errors: string[] = [];
  for (const page of form.pages) {
    if (!Array.isArray(page?.sections)) continue;
    for (const section of page.sections) {
      if (!Array.isArray(section?.fields)) continue;
      for (const field of section.fields) {
        if (field?.type && !SUPPORTED_FIELD_TYPES.has(field.type)) {
          errors.push(`field "${field.key || "?"}" has unsupported type "${field.type}"`);
        }
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[SERVICE_PACK_INVALID] ${serviceKey}/form.json: ${errors.join("; ")}`
    );
  }
}

/**
 * Validate all form.json files across every service pack.
 * Called at boot-time preflight to catch schema errors before serving traffic.
 */
export async function validateAllServicePackForms(): Promise<void> {
  const entries = await fs.readdir(servicePackRoot, { withFileTypes: true });
  const packs = entries
    .filter((e) => e.isDirectory() && !IGNORED_SERVICE_PACK_DIRECTORIES.has(e.name))
    .map((e) => e.name);

  for (const pack of packs) {
    const formPath = path.join(servicePackRoot, pack, "form.json");
    let form = await readOptionalJson(formPath);
    if (form === undefined) continue;
    form = await applySharedFormSections(form);
    validateFormFieldTypes(form, pack);
  }
}

export async function loadServicePacks(): Promise<ServiceSummary[]> {
  const entries = await fs.readdir(servicePackRoot, { withFileTypes: true });
  const packs = entries
    .filter((entry) => entry.isDirectory() && !IGNORED_SERVICE_PACK_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name);

  const results: ServiceSummary[] = [];
  for (const pack of packs) {
    const serviceYamlPath = path.join(servicePackRoot, pack, "service.yaml");
    let raw: string;
    try {
      raw = await fs.readFile(serviceYamlPath, "utf-8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new Error(`[SERVICE_PACK_INVALID] Missing service.yaml for service-pack: ${pack}`);
      }
      throw error;
    }
    const parsed = parseServiceMetadataYaml(raw, serviceYamlPath, { expectedServiceKey: pack });
    results.push(parsed);
  }

  return results.sort((a, b) => a.serviceKey.localeCompare(b.serviceKey));
}

export async function loadServiceConfig(serviceKey: string): Promise<any> {
  const serviceDir = path.join(servicePackRoot, serviceKey);
  const serviceYamlPath = path.join(serviceDir, "service.yaml");
  let serviceRaw: string;
  try {
    serviceRaw = await fs.readFile(serviceYamlPath, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new ServicePackNotFoundError(serviceKey);
    }
    throw error;
  }

  const service = parseServiceMetadataYaml(serviceRaw, serviceYamlPath, {
    expectedServiceKey: serviceKey,
  });

  const formPath = path.join(serviceDir, "form.json");
  const workflowPath = path.join(serviceDir, "workflow.json");
  const documentsPath = path.join(serviceDir, "documents.json");
  const feesPath = path.join(serviceDir, "fees.json");

  let form = await readOptionalJson(formPath);
  if (form !== undefined) {
    form = await applySharedFormSections(form);
  }
  const workflow = await readOptionalJson(workflowPath);
  const documents = await readOptionalJson(documentsPath);
  const feeSchedule = await readOptionalJson(feesPath);

  // Load declaration templates for doc types that reference them
  if (documents && typeof documents === "object" && Array.isArray((documents as any).documentTypes)) {
    for (const dt of (documents as any).documentTypes) {
      if (dt.declaration) {
        const declPath = path.join(serviceDir, "declarations", dt.declaration);
        const template = await readOptionalJson(declPath);
        if (template) {
          dt.declarationTemplate = template;
        }
      }
    }
  }

  return {
    ...service,
    form,
    workflow,
    documents,
    feeSchedule,
  };
}
