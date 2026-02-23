import { promises as fs } from "fs";
import path from "path";

const servicePackRoot = path.resolve(__dirname, "..", "..", "..", "service-packs");
const sharedRoot = path.join(servicePackRoot, "_shared");
const applicantSectionPath = path.join(sharedRoot, "applicant.section.json");

let cachedApplicantSection: any | null = null;

async function loadApplicantSection(): Promise<any | null> {
  if (cachedApplicantSection) return cachedApplicantSection;
  try {
    const raw = await fs.readFile(applicantSectionPath, "utf-8");
    cachedApplicantSection = JSON.parse(raw);
    return cachedApplicantSection;
  } catch {
    return null;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function applySharedFormSections(form: any): Promise<any> {
  if (!form || !Array.isArray(form.pages)) return form;
  const applicantSection = await loadApplicantSection();
  if (!applicantSection) return form;

  const pages = form.pages.map((page: any) => {
    const sections = Array.isArray(page.sections) ? page.sections.flatMap((section: any) => {
      if (section?.sharedSection === "applicant") {
        return [clone(applicantSection)];
      }
      if (section?.sharedSection) {
        return [];
      }

      if (Array.isArray(section?.fields)) {
        const expandedFields = section.fields.flatMap((field: any) => {
          if (field?.sharedSection === "applicant" && applicantSection?.fields) {
            return clone(applicantSection.fields);
          }
          if (field?.sharedSection) {
            return [];
          }
          return [field];
        });
        return [{ ...section, fields: expandedFields }];
      }

      return [section];
    }) : [];

    return { ...page, sections };
  });

  return { ...form, pages };
}

export function getApplicantSectionRequiredFields(): string[] {
  return [
    "applicant.first_name",
    "applicant.last_name",
    "applicant.full_name",
    "applicant.father_name",
    "applicant.gender",
    "applicant.marital_status",
    "applicant.date_of_birth",
    "applicant.aadhaar",
    "applicant.pan",
    "applicant.email",
    "applicant.mobile",
  ];
}
