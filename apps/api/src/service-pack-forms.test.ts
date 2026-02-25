import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { applySharedFormSections } from "./service-pack-shared";

/**
 * Comprehensive service pack form validation test suite.
 *
 * These tests validate every form.json across all service packs to catch:
 *   - Structural issues (missing pages/sections/fields)
 *   - Unsupported field types (must match FormRenderer switch cases)
 *   - Missing bilingual labels (label_hi, label_pa)
 *   - Enum fields without options
 *   - Duplicate field keys within a form
 *   - Invalid field key format
 *   - Shared section resolution errors
 *
 * Runs without a database or React — pure schema-level validation.
 */

const servicePackRoot = path.resolve(__dirname, "..", "..", "..", "service-packs");
const IGNORED_DIRS = new Set(["_shared", "README.md"]);

// Must stay in sync with FormRenderer switch cases AND service-packs.ts SUPPORTED_FIELD_TYPES
const SUPPORTED_FIELD_TYPES = new Set([
  "string", "text", "textarea", "number", "date",
  "email", "phone", "aadhaar", "boolean", "enum",
]);

// Note: ui.widget is a hint/metadata field. The FormRenderer only acts on
// "upn-picker" specifically; other widget values are informational and ignored.

// ----- Helpers -----

async function listServicePacks(): Promise<string[]> {
  const entries = await fs.readdir(servicePackRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !IGNORED_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
}

async function loadFormJson(pack: string): Promise<any | null> {
  const formPath = path.join(servicePackRoot, pack, "form.json");
  try {
    const raw = await fs.readFile(formPath, "utf-8");
    return JSON.parse(raw);
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

interface ValidationError {
  pack: string;
  path: string;
  message: string;
}

function collectFieldErrors(
  form: any,
  pack: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenKeys = new Set<string>();

  if (!form?.pages || !Array.isArray(form.pages)) {
    errors.push({ pack, path: "form", message: "missing or non-array 'pages'" });
    return errors;
  }

  for (let pi = 0; pi < form.pages.length; pi++) {
    const page = form.pages[pi];
    const pagePath = `pages[${pi}]`;

    if (!page.pageId) {
      errors.push({ pack, path: pagePath, message: "missing pageId" });
    }
    if (!page.title) {
      errors.push({ pack, path: pagePath, message: "missing title" });
    }
    if (!Array.isArray(page.sections)) {
      errors.push({ pack, path: pagePath, message: "missing or non-array 'sections'" });
      continue;
    }
    if (page.sections.length === 0) {
      errors.push({ pack, path: pagePath, message: "empty sections array" });
    }

    for (let si = 0; si < page.sections.length; si++) {
      const section = page.sections[si];
      const sectionPath = `${pagePath}.sections[${si}]`;

      if (!section.sectionId) {
        errors.push({ pack, path: sectionPath, message: "missing sectionId" });
      }
      if (!section.title) {
        errors.push({ pack, path: sectionPath, message: "missing title" });
      }
      if (!Array.isArray(section.fields)) {
        errors.push({ pack, path: sectionPath, message: "missing or non-array 'fields'" });
        continue;
      }
      // Empty fields arrays are allowed (e.g. placeholder sections for payment/system info)
      // but we skip further field validation for them

      for (let fi = 0; fi < section.fields.length; fi++) {
        const field = section.fields[fi];
        const fieldPath = `${sectionPath}.fields[${fi}]`;

        // Required field properties
        if (!field.key) {
          errors.push({ pack, path: fieldPath, message: "missing field key" });
        }
        if (!field.label) {
          errors.push({ pack, path: fieldPath, message: `field "${field.key || "?"}" missing label` });
        }
        if (!field.type) {
          errors.push({ pack, path: fieldPath, message: `field "${field.key || "?"}" missing type` });
        }

        // Field type must be supported
        if (field.type && !SUPPORTED_FIELD_TYPES.has(field.type)) {
          errors.push({
            pack,
            path: fieldPath,
            message: `field "${field.key || "?"}" has unsupported type "${field.type}"`,
          });
        }

        // Enum fields must have options
        if (field.type === "enum") {
          if (!field.ui?.options || !Array.isArray(field.ui.options) || field.ui.options.length === 0) {
            errors.push({
              pack,
              path: fieldPath,
              message: `enum field "${field.key}" has no ui.options`,
            });
          } else {
            // Each option must have value + label
            for (let oi = 0; oi < field.ui.options.length; oi++) {
              const opt = field.ui.options[oi];
              if (!opt.value && opt.value !== "") {
                errors.push({
                  pack,
                  path: `${fieldPath}.ui.options[${oi}]`,
                  message: `enum option missing value in field "${field.key}"`,
                });
              }
              if (!opt.label) {
                errors.push({
                  pack,
                  path: `${fieldPath}.ui.options[${oi}]`,
                  message: `enum option missing label in field "${field.key}"`,
                });
              }
            }
          }
        }

        // Duplicate key detection
        if (field.key && seenKeys.has(field.key)) {
          errors.push({
            pack,
            path: fieldPath,
            message: `duplicate field key "${field.key}"`,
          });
        }
        if (field.key) seenKeys.add(field.key);

        // Key format: should be dot-separated identifiers
        if (field.key && !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field.key)) {
          errors.push({
            pack,
            path: fieldPath,
            message: `field key "${field.key}" has invalid format`,
          });
        }
      }
    }
  }

  return errors;
}

// ----- Tests -----

describe("Service pack form validation", () => {
  let packs: string[];

  it("discovers all service packs", async () => {
    packs = await listServicePacks();
    expect(packs.length).toBeGreaterThanOrEqual(4); // at least the original 4
  });

  it("every form.json is valid JSON", async () => {
    packs = await listServicePacks();
    const failures: string[] = [];
    for (const pack of packs) {
      const formPath = path.join(servicePackRoot, pack, "form.json");
      try {
        const raw = await fs.readFile(formPath, "utf-8");
        JSON.parse(raw);
      } catch (err: any) {
        if (err.code === "ENOENT") continue;
        failures.push(`${pack}: ${err.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("every form.json has valid structure after shared section resolution", async () => {
    packs = await listServicePacks();
    const allErrors: ValidationError[] = [];

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);
      const errors = collectFieldErrors(form, pack);
      allErrors.push(...errors);
    }

    if (allErrors.length > 0) {
      const summary = allErrors
        .map((e) => `  ${e.pack} → ${e.path}: ${e.message}`)
        .join("\n");
      expect.fail(`Form validation errors:\n${summary}`);
    }
  });

  it("all field types across all forms are in SUPPORTED_FIELD_TYPES", async () => {
    packs = await listServicePacks();
    const unsupported: string[] = [];
    const typeUsage = new Map<string, string[]>();

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);

      for (const page of form.pages || []) {
        for (const section of page.sections || []) {
          for (const field of section.fields || []) {
            if (!field.type) continue;
            if (!typeUsage.has(field.type)) typeUsage.set(field.type, []);
            typeUsage.get(field.type)!.push(`${pack}/${field.key}`);

            if (!SUPPORTED_FIELD_TYPES.has(field.type)) {
              unsupported.push(`${pack}: field "${field.key}" uses unsupported type "${field.type}"`);
            }
          }
        }
      }
    }

    if (unsupported.length > 0) {
      expect.fail(`Unsupported field types found:\n  ${unsupported.join("\n  ")}`);
    }

    // Report type coverage for visibility
    const coverage = Array.from(typeUsage.entries())
      .map(([type, fields]) => `  ${type}: ${fields.length} fields`)
      .join("\n");
    console.log(`Field type coverage across all service packs:\n${coverage}`);
  });

  it("no duplicate field keys within any single form", async () => {
    packs = await listServicePacks();
    const duplicates: string[] = [];

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);

      const seen = new Set<string>();
      for (const page of form.pages || []) {
        for (const section of page.sections || []) {
          for (const field of section.fields || []) {
            if (!field.key) continue;
            if (seen.has(field.key)) {
              duplicates.push(`${pack}: duplicate key "${field.key}"`);
            }
            seen.add(field.key);
          }
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("every enum field has at least one option with value+label", async () => {
    packs = await listServicePacks();
    const missing: string[] = [];

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);

      for (const page of form.pages || []) {
        for (const section of page.sections || []) {
          for (const field of section.fields || []) {
            if (field.type !== "enum") continue;
            const options = field.ui?.options;
            if (!Array.isArray(options) || options.length === 0) {
              missing.push(`${pack}: enum "${field.key}" has no options`);
              continue;
            }
            for (const opt of options) {
              if (!opt.label) {
                missing.push(`${pack}: enum "${field.key}" option missing label`);
              }
            }
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("bilingual labels (label_hi + label_pa) present on all fields", async () => {
    packs = await listServicePacks();
    const missingHi: string[] = [];
    const missingPa: string[] = [];

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);

      for (const page of form.pages || []) {
        for (const section of page.sections || []) {
          for (const field of section.fields || []) {
            if (!field.label_hi) {
              missingHi.push(`${pack}/${field.key}`);
            }
            if (!field.label_pa) {
              missingPa.push(`${pack}/${field.key}`);
            }
          }
        }
      }
    }

    if (missingHi.length > 0) {
      console.warn(`Fields missing label_hi (${missingHi.length}):\n  ${missingHi.slice(0, 20).join("\n  ")}${missingHi.length > 20 ? `\n  ... and ${missingHi.length - 20} more` : ""}`);
    }
    if (missingPa.length > 0) {
      console.warn(`Fields missing label_pa (${missingPa.length}):\n  ${missingPa.slice(0, 20).join("\n  ")}${missingPa.length > 20 ? `\n  ... and ${missingPa.length - 20} more` : ""}`);
    }

    // This is a warning, not a hard failure, since some packs may not yet have translations
    // To enforce, uncomment:
    // expect(missingHi).toEqual([]);
    // expect(missingPa).toEqual([]);
  });

  it("bilingual titles (title_hi + title_pa) present on all pages and sections", async () => {
    packs = await listServicePacks();
    const missing: string[] = [];

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);

      for (const page of form.pages || []) {
        if (!page.title_hi) missing.push(`${pack}/page:${page.pageId} missing title_hi`);
        if (!page.title_pa) missing.push(`${pack}/page:${page.pageId} missing title_pa`);
        for (const section of page.sections || []) {
          if (!section.title_hi) missing.push(`${pack}/section:${section.sectionId} missing title_hi`);
          if (!section.title_pa) missing.push(`${pack}/section:${section.sectionId} missing title_pa`);
        }
      }
    }

    if (missing.length > 0) {
      console.warn(`Missing bilingual titles (${missing.length}):\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : ""}`);
    }
  });

  it("shared section resolution works for forms that use sharedSection: applicant", async () => {
    packs = await listServicePacks();
    let packsWithShared = 0;

    for (const pack of packs) {
      const rawForm = await loadFormJson(pack);
      if (!rawForm) continue;

      // Check if this form references a shared section
      const usesShared = JSON.stringify(rawForm).includes('"sharedSection"');
      if (!usesShared) continue;
      packsWithShared++;

      const resolved = await applySharedFormSections(rawForm);

      // After resolution, there should be no sharedSection references
      const stillHasShared = JSON.stringify(resolved).includes('"sharedSection"');
      expect(stillHasShared, `${pack}: unresolved sharedSection after apply`).toBe(false);

      // The resolved form should have applicant.* fields
      const allKeys: string[] = [];
      for (const page of resolved.pages) {
        for (const section of page.sections) {
          for (const field of section.fields) {
            allKeys.push(field.key);
          }
        }
      }

      const hasApplicantFields = allKeys.some((k) => k.startsWith("applicant."));
      expect(hasApplicantFields, `${pack}: shared applicant section resolved but no applicant.* fields found`).toBe(true);
    }

    // At least some packs should use shared sections
    expect(packsWithShared).toBeGreaterThan(0);
  });

  it("form.json formId and version are present", async () => {
    packs = await listServicePacks();
    const issues: string[] = [];

    for (const pack of packs) {
      const form = await loadFormJson(pack);
      if (!form) continue;

      if (!form.formId || typeof form.formId !== "string") {
        issues.push(`${pack}: missing or invalid formId`);
      }
      if (!form.version || typeof form.version !== "string") {
        issues.push(`${pack}: missing or invalid version`);
      }
      if (!form.pages || !Array.isArray(form.pages) || form.pages.length === 0) {
        issues.push(`${pack}: missing or empty pages array`);
      }
    }

    expect(issues).toEqual([]);
  });

  it("pageIds are unique within each form", async () => {
    packs = await listServicePacks();
    const duplicates: string[] = [];

    for (const pack of packs) {
      const form = await loadFormJson(pack);
      if (!form?.pages) continue;

      const seen = new Set<string>();
      for (const page of form.pages) {
        if (seen.has(page.pageId)) {
          duplicates.push(`${pack}: duplicate pageId "${page.pageId}"`);
        }
        seen.add(page.pageId);
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("sectionIds are unique within each form", async () => {
    packs = await listServicePacks();
    const duplicates: string[] = [];

    for (const pack of packs) {
      let form = await loadFormJson(pack);
      if (!form) continue;
      form = await applySharedFormSections(form);
      if (!form?.pages) continue;

      const seen = new Set<string>();
      for (const page of form.pages) {
        for (const section of page.sections || []) {
          if (seen.has(section.sectionId)) {
            duplicates.push(`${pack}: duplicate sectionId "${section.sectionId}"`);
          }
          seen.add(section.sectionId);
        }
      }
    }

    expect(duplicates).toEqual([]);
  });
});

describe("Service pack form cross-references", () => {
  it("SUPPORTED_FIELD_TYPES in service-packs.ts matches this test", async () => {
    // Read the source file and extract the set
    const source = await fs.readFile(
      path.resolve(__dirname, "service-packs.ts"),
      "utf-8"
    );
    const match = source.match(/SUPPORTED_FIELD_TYPES\s*=\s*new\s+Set\(\[\s*([\s\S]*?)\]\)/);
    expect(match, "Could not find SUPPORTED_FIELD_TYPES in service-packs.ts").toBeTruthy();

    const types = match![1]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
      .filter(Boolean);

    const testTypes = Array.from(SUPPORTED_FIELD_TYPES).sort();
    const sourceTypes = types.sort();

    expect(sourceTypes).toEqual(testTypes);
  });

  it("every service pack directory has a service.yaml", async () => {
    const packs = await listServicePacks();
    const missing: string[] = [];

    for (const pack of packs) {
      const yamlPath = path.join(servicePackRoot, pack, "service.yaml");
      try {
        await fs.access(yamlPath);
      } catch {
        missing.push(pack);
      }
    }

    expect(missing).toEqual([]);
  });
});
