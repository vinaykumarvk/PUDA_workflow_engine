/**
 * Seed script: service versions from service-packs + test users and officer postings.
 * Run: npx tsx scripts/seed.ts (from apps/api)
 */
import { promises as fs } from "fs";
import path from "path";
import { query } from "../src/db";
import { hashPassword } from "../src/auth";
import { applySharedFormSections } from "../src/service-pack-shared";
import { parseServiceMetadataYaml } from "../src/service-metadata";

const SERVICE_PACKS_ROOT = path.resolve(__dirname, "..", "..", "..", "service-packs");
const IGNORED_SERVICE_PACK_DIRECTORIES = new Set(["_shared"]);

async function loadServicePacks(): Promise<string[]> {
  const entries = await fs.readdir(SERVICE_PACKS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !IGNORED_SERVICE_PACK_DIRECTORIES.has(e.name))
    .map((e) => e.name);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error) && typeof error === "object" && "code" in (error as Record<string, unknown>);
}

async function readOptionalJson(filePath: string): Promise<any | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`[SEED_INVALID_JSON] ${filePath}: ${message}`);
  }
}

async function seedServiceVersions() {
  const packs = await loadServicePacks();
  const version = "1.0.0";
  const effectiveFrom = new Date().toISOString();

  for (const pack of packs) {
    const dir = path.join(SERVICE_PACKS_ROOT, pack);
    let service: ReturnType<typeof parseServiceMetadataYaml>;
    let form: any = null;
    let workflow: any = null;
    let documents: any = null;
    let feeSchedule: any = null;
    let rules: any = null;

    const yamlPath = path.join(dir, "service.yaml");
    let yamlRaw: string;
    try {
      yamlRaw = await fs.readFile(yamlPath, "utf-8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new Error(`[SEED_INVALID_SERVICE_PACK] ${pack}: missing service.yaml`);
      }
      throw error;
    }
    service = parseServiceMetadataYaml(yamlRaw, yamlPath, { expectedServiceKey: pack });

    form = await readOptionalJson(path.join(dir, "form.json"));
    if (form) {
      form = await applySharedFormSections(form);
    }
    workflow = await readOptionalJson(path.join(dir, "workflow.json"));
    documents = await readOptionalJson(path.join(dir, "documents.json"));
    feeSchedule = await readOptionalJson(path.join(dir, "fees.json"));
    rules = await readOptionalJson(path.join(dir, "rules.json"));

    const configJsonb = {
      serviceKey: service.serviceKey,
      displayName: service.displayName,
      submissionValidation: service.submissionValidation,
      form,
      workflow,
      documents,
      feeSchedule,
      rules,
    };

    await query(
      `INSERT INTO service (service_key, name, category, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (service_key) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         description = EXCLUDED.description`,
      [service.serviceKey, service.displayName, service.category, service.description]
    );

    await query(
      `INSERT INTO service_version (service_key, version, status, effective_from, config_jsonb)
       VALUES ($1, $2, 'published', $3, $4)
       ON CONFLICT (service_key, version) DO UPDATE SET
         status = EXCLUDED.status,
         effective_from = EXCLUDED.effective_from,
         config_jsonb = EXCLUDED.config_jsonb`,
      [service.serviceKey, version, effectiveFrom, JSON.stringify(configJsonb)]
    );
    console.log(`Published service_version: ${service.serviceKey}@${version}`);
  }
}

async function seedAuthorities() {
  const authorities = [
    ["PUDA", "Punjab Urban Development Authority"],
    ["GMADA", "Greater Mohali Area Development Authority"],
    ["GLADA", "Greater Ludhiana Area Development Authority"],
    ["BDA", "Bathinda Development Authority"],
  ];
  for (const [id, name] of authorities) {
    await query(
      `INSERT INTO authority (authority_id, name) VALUES ($1, $2) ON CONFLICT (authority_id) DO NOTHING`,
      [id, name]
    );
  }
  console.log("Authorities seeded.");
}

async function seedSystemRoles() {
  const roles = [
    ["CLERK", "Clerk", "Initial scrutiny"],
    ["SENIOR_ASSISTANT", "Senior Assistant", "Senior review"],
    ["ACCOUNT_OFFICER", "Account Officer", "Accounts verification"],
    ["JUNIOR_ENGINEER", "Junior Engineer", "Technical review"],
    ["DRAFTSMAN", "Draftsman", "Drawing review"],
    ["SDO", "Sub-Divisional Officer", "SDO approval"],
    ["ESTATE_OFFICER", "Estate Officer", "Estate approval"],
    ["SUPERINTENDENT", "Superintendent", "Superintendent approval"],
  ];
  for (const [id, name, desc] of roles) {
    await query(
      `INSERT INTO system_role (system_role_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (system_role_id) DO NOTHING`,
      [id, name, desc || null]
    );
  }
  console.log("System roles seeded.");
}

async function seedDesignationsAndMappings() {
  // Complete designation set covering ALL 4 UAT-1 services:
  //  NDC:        CLERK → SENIOR_ASSISTANT → ACCOUNT_OFFICER
  //  Water:      CLERK → JUNIOR_ENGINEER  → SDO
  //  Sewerage:   CLERK → JUNIOR_ENGINEER  → SDO
  //  Architect:  CLERK → DRAFTSMAN
  const designations: [string, string, string][] = [
    ["PUDA_CLERK",      "PUDA", "Clerk"],
    ["PUDA_SR_ASST",    "PUDA", "Senior Assistant (Accounts)"],
    ["PUDA_ACCT_OFF",   "PUDA", "Account Officer"],
    ["PUDA_JR_ENG",     "PUDA", "Junior Engineer"],
    ["PUDA_SDO",        "PUDA", "Sub-Divisional Officer"],
    ["PUDA_DRAFTSMAN",  "PUDA", "Draftsman"],
    ["PUDA_ESTATE_OFF", "PUDA", "Estate Officer"],
    ["PUDA_SUPT",       "PUDA", "Superintendent"],
  ];
  for (const [desigId, authorityId, name] of designations) {
    await query(
      `INSERT INTO designation (designation_id, authority_id, designation_name) VALUES ($1, $2, $3) ON CONFLICT (designation_id) DO NOTHING`,
      [desigId, authorityId, name]
    );
  }

  // Designation → System Role mapping (authority-scoped)
  const roleMappings: [string, string, string][] = [
    ["PUDA", "PUDA_CLERK",      "CLERK"],
    ["PUDA", "PUDA_SR_ASST",    "SENIOR_ASSISTANT"],
    ["PUDA", "PUDA_ACCT_OFF",   "ACCOUNT_OFFICER"],
    ["PUDA", "PUDA_JR_ENG",     "JUNIOR_ENGINEER"],
    ["PUDA", "PUDA_SDO",        "SDO"],
    ["PUDA", "PUDA_DRAFTSMAN",  "DRAFTSMAN"],
    ["PUDA", "PUDA_ESTATE_OFF", "ESTATE_OFFICER"],
    ["PUDA", "PUDA_SUPT",       "SUPERINTENDENT"],
  ];
  for (const [authId, desigId, roleId] of roleMappings) {
    await query(
      `INSERT INTO designation_role_map (authority_id, designation_id, system_role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [authId, desigId, roleId]
    );
  }
  console.log("Designations and role mappings seeded (8 designations for PUDA).");
}

async function seedUsers() {
  const password = "password123";
  const hash = await hashPassword(password);
  
  // Create 5 citizens with different scenarios
  const citizens = [
    { id: "test-citizen-1", login: "citizen1", name: "Rajesh Kumar", email: "rajesh@test.puda.gov.in", aadhar: "123456789012", mobile: "9876543210", salutation: "MR", gender: "MALE", marital_status: "MARRIED", dob: "1985-02-10", pan: "ABCDE1234F", father_name: "Suresh Kumar" },
    { id: "test-citizen-2", login: "citizen2", name: "Priya Sharma", email: "priya@test.puda.gov.in", aadhar: "234567890123", mobile: "9876543211", salutation: "MS", gender: "FEMALE", marital_status: "SINGLE", dob: "1990-07-21", pan: "BCDEF2345G", father_name: "Rakesh Sharma" },
    { id: "test-citizen-3", login: "citizen3", name: "Amit Singh", email: "amit@test.puda.gov.in", aadhar: "345678901234", mobile: "9876543212", salutation: "MR", gender: "MALE", marital_status: "MARRIED", dob: "1982-11-05", pan: "CDEFG3456H", father_name: "Mahinder Singh" },
    { id: "test-citizen-4", login: "citizen4", name: "Sunita Devi", email: "sunita@test.puda.gov.in", aadhar: "456789012345", mobile: "9876543213", salutation: "MRS", gender: "FEMALE", marital_status: "MARRIED", dob: "1988-03-14", pan: "DEFGH4567J", father_name: "Brij Mohan" },
    { id: "test-citizen-5", login: "citizen5", name: "Vikram Mehta", email: "vikram@test.puda.gov.in", aadhar: "567890123456", mobile: "9876543214", salutation: "MR", gender: "MALE", marital_status: "SINGLE", dob: "1992-09-30", pan: "EFGHI5678K", father_name: "Naveen Mehta" },
  ];

  // Address data per citizen
  const citizenAddresses: Record<string, any> = {
    "test-citizen-1": {
      permanent: { line1: "H.No. 2301, Sector 20", line2: "", city: "Mohali", state: "Punjab", district: "SAS Nagar", pincode: "160020" },
      communication: { same_as_permanent: true, line1: null, line2: null, city: null, state: null, district: null, pincode: null },
    },
    "test-citizen-2": {
      permanent: { line1: "H.No. 1147, Sarabha Nagar", line2: "", city: "Ludhiana", state: "Punjab", district: "Ludhiana", pincode: "141001" },
      communication: { same_as_permanent: false, line1: "Office No. 45, Mall Road", line2: "Near Clock Tower", city: "Ludhiana", state: "Punjab", district: "Ludhiana", pincode: "141008" },
    },
    "test-citizen-3": {
      permanent: { line1: "H.No. 3278, Block C, Ranjit Avenue", line2: "", city: "Amritsar", state: "Punjab", district: "Amritsar", pincode: "143001" },
      communication: { same_as_permanent: true, line1: null, line2: null, city: null, state: null, district: null, pincode: null },
    },
    "test-citizen-4": {
      permanent: { line1: "H.No. 2156, Model Town Extension", line2: "", city: "Jalandhar", state: "Punjab", district: "Jalandhar", pincode: "144003" },
      communication: { same_as_permanent: false, line1: "Shop No. 12, GT Road", line2: "Near Bus Stand", city: "Jalandhar", state: "Punjab", district: "Jalandhar", pincode: "144001" },
    },
    "test-citizen-5": {
      permanent: { line1: "Flat No. 1089, Sector 4, Leela Bhawan", line2: "", city: "Patiala", state: "Punjab", district: "Patiala", pincode: "147001" },
      communication: { same_as_permanent: true, line1: null, line2: null, city: null, state: null, district: null, pincode: null },
    },
  };

  for (const citizen of citizens) {
    const nameParts = citizen.name.split(" ").filter(Boolean);
    const firstName = nameParts[0] || citizen.name;
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "";
    const profile = {
      applicant: {
        salutation: citizen.salutation,
        first_name: firstName,
        middle_name: middleName || undefined,
        last_name: lastName,
        full_name: citizen.name,
        father_name: citizen.father_name,
        gender: citizen.gender,
        marital_status: citizen.marital_status,
        date_of_birth: citizen.dob,
        aadhaar: citizen.aadhar,
        pan: citizen.pan,
        email: citizen.email,
        mobile: citizen.mobile
      },
      addresses: citizenAddresses[citizen.id] || {},
    };
    await query(
      `INSERT INTO "user" (user_id, login, password_hash, name, email, phone, user_type, profile_jsonb)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, phone = EXCLUDED.phone, profile_jsonb = EXCLUDED.profile_jsonb`,
      [citizen.id, citizen.login, hash, citizen.name, citizen.email, citizen.aadhar, "CITIZEN", JSON.stringify(profile)]
    );
  }

  // Create officers with distinct roles matching the BRD workflow hierarchy
  const officers = [
    { id: "test-officer-1", login: "officer1", name: "Harpreet Kaur (Clerk)", email: "clerk@test.puda.gov.in" },
    { id: "test-officer-2", login: "officer2", name: "Gurdeep Singh (Sr. Assistant)", email: "sr.asst@test.puda.gov.in" },
    { id: "test-officer-3", login: "officer3", name: "Manpreet Sandhu (Account Officer)", email: "acct.off@test.puda.gov.in" },
    { id: "test-officer-4", login: "officer4", name: "Jaswinder Gill (Junior Engineer)", email: "jr.eng@test.puda.gov.in" },
    { id: "test-officer-5", login: "officer5", name: "Balwinder Dhillon (SDO)", email: "sdo@test.puda.gov.in" },
    { id: "test-officer-6", login: "officer6", name: "Ravinder Kaur (Draftsman)", email: "draftsman@test.puda.gov.in" },
  ];
  for (const officer of officers) {
    await query(
      `INSERT INTO "user" (user_id, login, password_hash, name, email, user_type, profile_jsonb)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, profile_jsonb = EXCLUDED.profile_jsonb`,
      [officer.id, officer.login, hash, officer.name, officer.email, "OFFICER", JSON.stringify({})]
    );
  }
  
  console.log("Test users seeded:");
  console.log("Citizens: citizen1-5 (password: password123)");
  console.log("Officers: officer1-6 (password: password123)");
  console.log("  officer1 = Clerk");
  console.log("  officer2 = Sr. Assistant (Accounts)");
  console.log("  officer3 = Account Officer");
  console.log("  officer4 = Junior Engineer");
  console.log("  officer5 = SDO");
  console.log("  officer6 = Draftsman");
}

async function seedUserPosting() {
  // Each officer has a single designation matching their role
  // Authority + Designation → System Role (via designation_role_map)
  //
  // Entitlement matrix for PUDA UAT-1 services:
  // ┌─────────────────────────┬───────┬──────────────────┬─────────────────┬────────────┬─────┬───────────┐
  // │ State                   │ CLERK │ SENIOR_ASSISTANT  │ ACCOUNT_OFFICER │ JR_ENGINEER│ SDO │ DRAFTSMAN │
  // ├─────────────────────────┼───────┼──────────────────┼─────────────────┼────────────┼─────┼───────────┤
  // │ NDC: PENDING_AT_CLERK   │  ✓    │                  │                 │            │     │           │
  // │ NDC: PENDING_AT_SR_ASST │       │       ✓          │                 │            │     │           │
  // │ NDC: PENDING_AT_AO      │       │                  │       ✓         │            │     │           │
  // │ Water: PENDING_AT_CLERK │  ✓    │                  │                 │            │     │           │
  // │ Water: PENDING_AT_JE    │       │                  │                 │     ✓      │     │           │
  // │ Water: PENDING_AT_SDE   │       │                  │                 │            │  ✓  │           │
  // │ Sewer: PENDING_AT_CLERK │  ✓    │                  │                 │            │     │           │
  // │ Sewer: PENDING_AT_JE    │       │                  │                 │     ✓      │     │           │
  // │ Sewer: PENDING_AT_SDO   │       │                  │                 │            │  ✓  │           │
  // │ Arch:  PENDING_AT_CLERK │  ✓    │                  │                 │            │     │           │
  // │ Arch:  PENDING_AT_DRAFT │       │                  │                 │            │     │     ✓     │
  // └─────────────────────────┴───────┴──────────────────┴─────────────────┴────────────┴─────┴───────────┘
  const postings: [string, string, string, string][] = [
    // officer1 (Clerk) — sees ALL services at clerk stage
    ["posting-officer1-puda-clerk",  "test-officer-1", "PUDA", "PUDA_CLERK"],
    // officer2 (Sr. Assistant) — sees NDC at senior assistant stage
    ["posting-officer2-puda-sr",     "test-officer-2", "PUDA", "PUDA_SR_ASST"],
    // officer3 (Account Officer) — sees NDC at account officer stage
    ["posting-officer3-puda-ao",     "test-officer-3", "PUDA", "PUDA_ACCT_OFF"],
    // officer4 (Junior Engineer) — sees Water Supply & Sewerage at JE stage
    ["posting-officer4-puda-je",     "test-officer-4", "PUDA", "PUDA_JR_ENG"],
    // officer5 (SDO) — sees Water Supply & Sewerage at SDO stage
    ["posting-officer5-puda-sdo",    "test-officer-5", "PUDA", "PUDA_SDO"],
    // officer6 (Draftsman) — sees Architect Registration at draftsman stage
    ["posting-officer6-puda-draft",  "test-officer-6", "PUDA", "PUDA_DRAFTSMAN"],
  ];
  for (const [postingId, userId, authorityId, designationId] of postings) {
    await query(
      `INSERT INTO user_posting (posting_id, user_id, authority_id, designation_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (posting_id) DO UPDATE SET designation_id = EXCLUDED.designation_id`,
      [postingId, userId, authorityId, designationId]
    );
  }
  console.log("Officer postings seeded (6 officers with distinct roles for PUDA).");
}

// Real ULPIN-based properties per citizen (must match seedProperties() data)
const CITIZEN_UPNS: Record<string, { upn: string; area_sqyd: number; plot_no: string; type: string; scheme_name: string; authority_name: string }[]> = {
  "test-citizen-1": [
    { upn: "PB-140-001-003-002301", area_sqyd: 200, plot_no: "2301", type: "RESIDENTIAL", scheme_name: "PUDA Sector-20 Mohali", authority_name: "PUDA" },
    { upn: "PB-140-001-005-004512", area_sqyd: 350, plot_no: "4512", type: "COMMERCIAL", scheme_name: "PUDA Industrial Area Phase-8", authority_name: "PUDA" },
  ],
  "test-citizen-2": [
    { upn: "PB-141-002-007-001147", area_sqyd: 180, plot_no: "1147", type: "RESIDENTIAL", scheme_name: "Sarabha Nagar Housing Scheme", authority_name: "PUDA" },
  ],
  "test-citizen-3": [
    { upn: "PB-143-003-011-003278", area_sqyd: 250, plot_no: "3278", type: "RESIDENTIAL", scheme_name: "Ranjit Avenue Amritsar", authority_name: "PUDA" },
    { upn: "PB-143-003-015-005643", area_sqyd: 100, plot_no: "5643", type: "RESIDENTIAL", scheme_name: "Green Avenue Amritsar", authority_name: "PUDA" },
  ],
  "test-citizen-4": [
    { upn: "PB-144-004-008-002156", area_sqyd: 175, plot_no: "2156", type: "RESIDENTIAL", scheme_name: "Model Town Jalandhar", authority_name: "PUDA" },
    { upn: "PB-144-004-012-007834", area_sqyd: 300, plot_no: "7834", type: "COMMERCIAL", scheme_name: "GT Road Commercial Complex", authority_name: "PUDA" },
  ],
  "test-citizen-5": [
    { upn: "PB-147-005-002-001089", area_sqyd: 150, plot_no: "1089", type: "RESIDENTIAL", scheme_name: "Leela Bhawan Housing Scheme", authority_name: "PUDA" },
    { upn: "PB-147-005-009-003421", area_sqyd: 120, plot_no: "3421", type: "RESIDENTIAL", scheme_name: "New Housing Board Patiala", authority_name: "PUDA" },
  ],
};

// Helper function to generate BRD-compliant form data for each service
function generateFormData(serviceKey: string, citizenName: string, index: number, citizenId?: string): any {
  const citizenUpns = (citizenId && CITIZEN_UPNS[citizenId]) || [];
  const upnEntry = citizenUpns[index % Math.max(citizenUpns.length, 1)] || null;
  const baseProperty = upnEntry ?? {
    upn: `PB-140-001-003-00${1000 + index}`,
    area_sqyd: 200 + (index * 50),
    authority_name: "PUDA",
    plot_no: `${1000 + index}`,
    type: index % 2 === 0 ? "RESIDENTIAL" : "COMMERCIAL",
    scheme_name: `PUDA Housing Scheme ${index}`
  };

  switch (serviceKey) {
    case "no_due_certificate":
      return {
        authority_id: "PUDA",
        applicant: {
          full_name: citizenName
        },
        property: baseProperty
      };

    case "sanction_of_water_supply":
      return {
        property: baseProperty,
        applicant: {
          full_name: citizenName
        },
        building: {
          plan_sanction_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          floors_constructed: 2 + (index % 3),
          basement_constructed: index % 2 === 0,
          basement_area_sqft: index % 2 === 0 ? 500 : null,
          ground_floor_area_sqft: 1200 + (index * 100),
          first_floor_area_sqft: 1000 + (index * 80),
          second_floor_area_sqft: index > 2 ? 800 : null,
          mumty_constructed: index % 3 === 0,
          mumty_area_sqft: index % 3 === 0 ? 200 : null,
          estimated_cost: 500000 + (index * 100000)
        },
        water: {
          purpose: "Domestic",
          service_pipe_length_ft: 50 + (index * 10),
          service_pipe_size: "1 inch",
          number_of_taps: 3 + (index % 3),
          tap_size: "0.5 inch",
          ferrule_cock_size: "1 inch"
        }
      };

    case "sanction_of_sewerage_connection":
      return {
        property: baseProperty,
        applicant: {
          full_name: citizenName
        },
        building: {
          status: "Completed",
          plan_sanction_date: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          floors_constructed: 2 + (index % 2),
          basement_constructed: index % 3 === 0,
          number_of_seats: 4 + (index % 4),
          hot_water_fitting_material: "CPVC"
        },
        plumber: {
          installation_bill_no: `BILL-${1000 + index}`,
          name: `Plumber ${index}`,
          license_no: `LIC-${2000 + index}`,
          address: `Address ${index}, City`,
          certificate_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      };

    case "registration_of_architect":
      return {
        authority_id: "PUDA",
        applicant: {
          pan: `ABCDE${1000 + index}F`,
          salutation: index % 2 === 0 ? "MR" : "MS",
          full_name: citizenName,
          father_name: `Father ${index}`,
          gender: index % 2 === 0 ? "MALE" : "FEMALE",
          marital_status: index % 2 === 0 ? "MARRIED" : "SINGLE",
          date_of_birth: new Date(1980 + (index % 20), index % 12, 1 + (index % 28)).toISOString().split('T')[0],
          aadhaar: `1234567890${index}`,
          email: `architect${index}@test.com`,
          mobile: `987654321${index}`
        },
        coa: {
          certificate_number: `COA-${3000 + index}`,
          valid_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          valid_till: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        address: {
          permanent: {
            line1: `Permanent Address ${index}`,
            state: "Punjab",
            district: "Mohali",
            pincode: `140${100 + index}`
          },
          communication: {
            same_as_permanent: index % 2 === 0,
            line1: index % 2 === 0 ? null : `Communication Address ${index}`,
            state: index % 2 === 0 ? null : "Punjab",
            district: index % 2 === 0 ? null : "Mohali",
            pincode: index % 2 === 0 ? null : `140${200 + index}`
          }
        }
      };

    default:
      return { applicant: { full_name: citizenName } };
  }
}

// Helper function to get document types for a service
function getDocumentTypes(serviceKey: string): string[] {
  switch (serviceKey) {
    case "no_due_certificate":
      return ["DOC_PAYMENT_RECEIPT"];
    case "sanction_of_water_supply":
      return ["DOC_BUILDING_PLAN", "DOC_GPA", "DOC_PLUMBER_CERT", "DOC_ARCH_ESTIMATE", "DOC_UNDERTAKING", "DOC_OWNER_PHOTOS", "DOC_OWNER_PHOTO_IDS"];
    case "sanction_of_sewerage_connection":
      return ["DOC_OCCUPATION_CERT", "DOC_WATER_RECEIPT", "DOC_UNDERTAKING", "DOC_PLUMBER_CERT"];
    case "registration_of_architect":
      return ["DOC_COA_CERT", "DOC_ARCH_DEGREE", "DOC_ADDRESS_PROOF", "DOC_AADHAAR", "DOC_PAN"];
    default:
      return [];
  }
}

async function seedCitizenApplications() {
  const { v4: uuidv4 } = await import("uuid");
  const year = new Date().getFullYear();
  
  // Clean up existing test citizen data first
  console.log("Cleaning up existing test citizen data...");
  const testCitizenArnSubquery =
    "(SELECT arn FROM application WHERE applicant_user_id LIKE 'test-citizen%')";

  // Delete in FK-safe order: children that reference query/decision/task first.
  await query(
    `DELETE FROM notice_letter
     WHERE arn IN ${testCitizenArnSubquery}
        OR query_id IN (SELECT query_id FROM query WHERE arn IN ${testCitizenArnSubquery})
        OR decision_id IN (SELECT decision_id FROM decision WHERE arn IN ${testCitizenArnSubquery})`
  );
  await query(`DELETE FROM output WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM decision WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM inspection WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM refund_request WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM payment WHERE arn IN ${testCitizenArnSubquery}`);
  await query(
    `DELETE FROM fee_demand_line
     WHERE demand_id IN (SELECT demand_id FROM fee_demand WHERE arn IN ${testCitizenArnSubquery})`
  );
  await query(`DELETE FROM fee_demand WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM fee_line_item WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM notification_log WHERE arn IN ${testCitizenArnSubquery}`);
  await query(
    `DELETE FROM notification
     WHERE user_id LIKE 'test-citizen%' OR arn IN ${testCitizenArnSubquery}`
  );
  await query(`DELETE FROM application_document WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM document WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM query WHERE arn IN ${testCitizenArnSubquery}`);
  await query(
    `DELETE FROM auth_mfa_challenge
     WHERE task_id IN (SELECT task_id FROM task WHERE arn IN ${testCitizenArnSubquery})`
  );
  await query(`DELETE FROM task WHERE arn IN ${testCitizenArnSubquery}`);
  await query(`DELETE FROM application_property WHERE arn IN ${testCitizenArnSubquery}`);
  // Also clean up citizen_property links so seedProperties can delete property rows
  await query(`DELETE FROM citizen_property WHERE user_id LIKE 'test-citizen%'`);
  // Delete properties owned only by test citizens (use the ULPIN format seeded below)
  await query(`DELETE FROM property WHERE unique_property_number LIKE 'PB-%' AND NOT EXISTS (SELECT 1 FROM application_property ap WHERE ap.property_id = property.property_id)`);
  await query("DELETE FROM application WHERE applicant_user_id LIKE 'test-citizen%'");
  console.log("Existing test citizen data cleaned up.");
  
  // Get service versions
  const services = await query("SELECT service_key, version FROM service_version WHERE status = 'published'");
  const serviceKeys = services.rows.map(r => r.service_key);
  
  if (serviceKeys.length === 0) {
    console.log("No services available, skipping application seeding");
    return;
  }

  // Get citizen names
  const citizens = await query("SELECT user_id, name FROM \"user\" WHERE user_type = 'CITIZEN' AND user_id LIKE 'test-citizen%' ORDER BY user_id");
  const citizenNames: Record<string, string> = {};
  citizens.rows.forEach((row: any) => {
    citizenNames[row.user_id] = row.name;
  });

  // Citizen 1: Has query pending, draft, and approved applications
  const citizen1Apps = [
    { service: "no_due_certificate", state: "QUERY_PENDING", daysAgo: 2, hasQuery: true },
    { service: "sanction_of_water_supply", state: "DRAFT", daysAgo: 1 },
    { service: "sanction_of_sewerage_connection", state: "CLOSED", daysAgo: 15, disposalType: "APPROVED" },
    { service: "registration_of_architect", state: "PENDING_AT_CLERK", daysAgo: 5 },
  ];

  // Citizen 2: Has document request and submitted applications
  const citizen2Apps = [
    { service: "no_due_certificate", state: "QUERY_PENDING", daysAgo: 3, hasQuery: true, hasDocRequest: true },
    { service: "sanction_of_water_supply", state: "SUBMITTED", daysAgo: 1 },
    { service: "sanction_of_sewerage_connection", state: "CLOSED", daysAgo: 20, disposalType: "APPROVED" },
  ];

  // Citizen 3: New user with only draft applications
  const citizen3Apps = [
    { service: "no_due_certificate", state: "DRAFT", daysAgo: 0 },
  ];

  // Citizen 4: Active user with multiple in-progress applications
  const citizen4Apps = [
    { service: "no_due_certificate", state: "PENDING_AT_SR_ASSISTANT_ACCOUNTS", daysAgo: 7 },
    { service: "sanction_of_water_supply", state: "PENDING_AT_JUNIOR_ENGINEER", daysAgo: 4 },
    { service: "registration_of_architect", state: "SUBMITTED", daysAgo: 2 },
    { service: "sanction_of_sewerage_connection", state: "CLOSED", daysAgo: 30, disposalType: "APPROVED" },
  ];

  // Citizen 5: Has rejected and query pending
  const citizen5Apps = [
    { service: "no_due_certificate", state: "CLOSED", daysAgo: 10, disposalType: "REJECTED" },
    { service: "sanction_of_water_supply", state: "QUERY_PENDING", daysAgo: 5, hasQuery: true },
    { service: "registration_of_architect", state: "CLOSED", daysAgo: 25, disposalType: "APPROVED" },
  ];

  const citizenAppMap: Record<string, any[]> = {
    "test-citizen-1": citizen1Apps,
    "test-citizen-2": citizen2Apps,
    "test-citizen-3": citizen3Apps,
    "test-citizen-4": citizen4Apps,
    "test-citizen-5": citizen5Apps,
  };

  for (const [citizenId, apps] of Object.entries(citizenAppMap)) {
    let appIndex = 0;
    for (const appData of apps) {
      if (!serviceKeys.includes(appData.service)) continue;

      const createdDate = new Date();
      createdDate.setDate(createdDate.getDate() - appData.daysAgo);
      
      // Generate unique ARN with better uniqueness
      const timestampMs = createdDate.getTime();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      const arn = `PUDA/${year}/${appData.service.substring(0, 3).toUpperCase()}/${timestampMs}-${appIndex}-${randomSuffix}`;
      const timestamp = createdDate.toISOString();
      appIndex++;
      
      // Generate BRD-compliant form data
      const formData = generateFormData(appData.service, citizenNames[citizenId] || "Test User", appIndex, citizenId);
      
      // Create application with BRD-compliant data
      await query(
        `INSERT INTO application (arn, service_key, service_version, authority_id, applicant_user_id, state_id, data_jsonb, created_at, submitted_at, disposed_at, disposal_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (arn) DO NOTHING`,
        [
          arn,
          appData.service,
          "1.0.0",
          "PUDA",
          citizenId,
          appData.state,
          JSON.stringify(formData),
          timestamp,
          appData.state !== "DRAFT" ? timestamp : null,
          appData.disposalType ? timestamp : null,
          appData.disposalType || null
        ]
      );

      // Create documents matching BRD document list
      const docTypes = getDocumentTypes(appData.service);
      for (const docTypeId of docTypes) {
        // Skip optional documents randomly for variety
        if (docTypeId === "DOC_GPA" && appIndex % 3 !== 0) continue;
        if (docTypeId === "DOC_PAYMENT_RECEIPT" && formData.payment_details_updated) continue;
        
        const docId = uuidv4();
        await query(
          `INSERT INTO document (doc_id, arn, doc_type_id, original_filename, mime_type, size_bytes, storage_key, uploaded_by_user_id, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (doc_id) DO NOTHING`,
          [
            docId,
            arn,
            docTypeId,
            `${docTypeId}_${arn}.pdf`,
            "application/pdf",
            1024 * 100, // 100KB dummy size
            `${arn}/${docTypeId}/v1/${docId}.pdf`,
            citizenId,
            timestamp
          ]
        );
      }

      // Create tasks for applications in task states (matching BRD workflow states)
      const taskStateMap: Record<string, { systemRoleId: string; slaDays: number }> = {
        "PENDING_AT_CLERK": { systemRoleId: "CLERK", slaDays: appData.service === "registration_of_architect" ? 2 : 1 },
        "PENDING_AT_SR_ASSISTANT_ACCOUNTS": { systemRoleId: "SENIOR_ASSISTANT", slaDays: 3 },
        "PENDING_AT_ACCOUNT_OFFICER": { systemRoleId: "ACCOUNT_OFFICER", slaDays: 1 },
        "PENDING_AT_JUNIOR_ENGINEER": { systemRoleId: "JUNIOR_ENGINEER", slaDays: 2 },
        "PENDING_AT_SDE": { systemRoleId: "SDO", slaDays: 1 },  // legacy
        "PENDING_AT_SDO": { systemRoleId: "SDO", slaDays: 1 },
        "PENDING_AT_SDO_PH": { systemRoleId: "SDO", slaDays: 1 },
        "PENDING_AT_DRAFTSMAN": { systemRoleId: "DRAFTSMAN", slaDays: 2 },
      };

      if (taskStateMap[appData.state]) {
        const taskInfo = taskStateMap[appData.state];
        const taskId = uuidv4();
        const slaDueAt = new Date(createdDate);
        slaDueAt.setDate(slaDueAt.getDate() + taskInfo.slaDays);
        
        await query(
          `INSERT INTO task (task_id, arn, state_id, system_role_id, status, sla_due_at, created_at)
           VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
           ON CONFLICT (task_id) DO NOTHING`,
          [
            taskId,
            arn,
            appData.state,
            taskInfo.systemRoleId,
            slaDueAt.toISOString(),
            timestamp
          ]
        );
      }

      // Create query if needed
      if (appData.hasQuery) {
        const queryId = uuidv4();
        const responseDue = new Date(createdDate);
        responseDue.setDate(responseDue.getDate() + 7);
        
        // Get appropriate document types for query based on service
        const docTypes = getDocumentTypes(appData.service);
        const queryDocTypes = appData.hasDocRequest && docTypes.length > 0 
          ? [docTypes[0]] // Request first mandatory document
          : [];
        
        // Determine unlocked fields based on service
        let unlockedFields: string[] = [];
        if (appData.service === "no_due_certificate") {
          unlockedFields = appData.hasDocRequest ? [] : ["property.upn", "property.plot_no"];
        } else if (appData.service === "sanction_of_water_supply") {
          unlockedFields = appData.hasDocRequest ? [] : ["property.upn", "water.purpose"];
        } else if (appData.service === "sanction_of_sewerage_connection") {
          unlockedFields = appData.hasDocRequest ? [] : ["property.upn", "plumber.name"];
        } else if (appData.service === "registration_of_architect") {
          unlockedFields = appData.hasDocRequest ? [] : ["applicant.full_name", "coa.certificate_number"];
        }
        
        await query(
          `INSERT INTO query (query_id, arn, query_number, message, status, raised_at, response_due_at, unlocked_field_keys, unlocked_doc_type_ids)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (query_id) DO NOTHING`,
          [
            queryId,
            arn,
            1,
            appData.hasDocRequest 
              ? `Please upload the required document: ${queryDocTypes[0] || 'missing document'}. The current document is not clear or missing.`
              : `Please provide clarification on the ${unlockedFields[0] || 'application details'} mentioned in the application.`,
            "PENDING",
            timestamp,
            responseDue.toISOString(),
            unlockedFields,
            queryDocTypes
          ]
        );

        // Create notification for query
        await query(
          `INSERT INTO notification (notification_id, user_id, arn, event_type, title, message, read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7)
           ON CONFLICT (notification_id) DO NOTHING`,
          [
            uuidv4(),
            citizenId,
            arn,
            "QUERY_RAISED",
            "Query Raised",
            `A query has been raised on your application ${arn}. Please respond.`,
            timestamp
          ]
        );
      }

      // Create notifications for other events
      if (appData.state === "SUBMITTED") {
        await query(
          `INSERT INTO notification (notification_id, user_id, arn, event_type, title, message, read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7)
           ON CONFLICT (notification_id) DO NOTHING`,
          [
            uuidv4(),
            citizenId,
            arn,
            "APPLICATION_SUBMITTED",
            "Application Submitted",
            `Your application ${arn} has been submitted successfully.`,
            timestamp
          ]
        );
      }

      if (appData.disposalType === "APPROVED") {
        await query(
          `INSERT INTO notification (notification_id, user_id, arn, event_type, title, message, read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7)
           ON CONFLICT (notification_id) DO NOTHING`,
          [
            uuidv4(),
            citizenId,
            arn,
            "APPLICATION_APPROVED",
            "Application Approved",
            `Your application ${arn} has been approved.`,
            timestamp
          ]
        );
      }
    }
  }

  console.log("Citizen applications seeded with various states and notifications.");
}

/**
 * Seed citizen-owned properties using ULPIN (Bhu-Aadhar) format for UPN.
 *
 * ULPIN format: PB-{district_code}-{tehsil_code}-{village_code}-{plot_no}
 *   PB          = Punjab state code
 *   district    = 3-digit district code
 *   tehsil      = 3-digit tehsil/sub-district code
 *   village     = 3-digit village code
 *   plot_no     = 6-digit plot/survey number
 *
 * District codes used:
 *   140 = SAS Nagar (Mohali)
 *   141 = Ludhiana
 *   143 = Amritsar
 *   144 = Jalandhar
 *   147 = Patiala
 */
async function seedProperties() {
  const { v4: uuidv4 } = await import("uuid");

  // Clean up existing test citizen property links (already done in seedCitizenApplications, but safe to repeat)
  await query(`DELETE FROM citizen_property WHERE user_id LIKE 'test-citizen%'`);
  // Only delete properties not referenced by any application_property
  await query(`DELETE FROM property WHERE unique_property_number LIKE 'PB-%' AND NOT EXISTS (SELECT 1 FROM application_property ap WHERE ap.property_id = property.property_id)`);

  type PropertySeed = {
    propertyId: string;
    upn: string;
    authorityId: string;
    plotNo: string;
    schemeName: string;
    sectorOrArea: string;
    usageType: string;
    propertyType: string;
    areaSqyd: number;
    district: string;
    tehsil: string;
    village: string;
    khasraNo: string;
    allotteeName: string;
    allotmentRefNo: string;
    allotmentDate: string;
    outstandingAmount: number;
    address: object;
  };

  type NdcSeedPayment = {
    dueCode: string;
    paymentDate: string;
    amount: number;
  };

  type NdcDuesSeed = {
    propertyValue: number;
    annualInterestRatePct: number;
    dcfRatePct: number;
    additionalAreaSqyd: number;
    additionalAreaRatePerSqyd: number;
    constructionCompletedAt: string | null;
    installmentAmounts: number[];
    payments: NdcSeedPayment[];
  };

  const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const addMonths = (dateOnly: string, months: number) => {
    const date = new Date(`${dateOnly}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  };
  const addDays = (dateOnly: string, days: number) => {
    const date = new Date(`${dateOnly}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const delayedInterest = (baseAmount: number, dueDate: string, paymentDate: string, annualRate: number) => {
    const due = new Date(`${dueDate}T00:00:00.000Z`);
    const paid = new Date(`${paymentDate}T00:00:00.000Z`);
    const delayedDays = Math.max(
      0,
      Math.floor((paid.getTime() - due.getTime()) / (24 * 60 * 60 * 1000))
    );
    if (delayedDays <= 0) return 0;
    return round2((baseAmount * (annualRate / 100) * delayedDays) / 365);
  };

  const buildNdcDuesSeed = (property: PropertySeed, index: number): NdcDuesSeed => {
    const annualInterestRatePct = 12;
    const dcfRatePct = property.usageType === "COMMERCIAL" ? 3 : 2.5;
    const additionalAreaRatePerSqyd = 1800;
    const propertyValue = Math.round(
      property.areaSqyd * (property.usageType === "COMMERCIAL" ? 22000 : 14500)
    );
    const installmentBase = Math.round(
      propertyValue * (property.usageType === "COMMERCIAL" ? 0.095 : 0.085)
    );
    const installmentAmounts = Array.from({ length: 6 }, (_, dueIndex) =>
      Math.round(installmentBase + dueIndex * 250)
    );

    const profileBucket = index % 3;
    const paidInstallments = profileBucket === 0 ? 6 : profileBucket === 1 ? 4 : 2;
    const additionalAreaSqyd = profileBucket === 0 ? 0 : profileBucket === 1 ? 24 : 42;
    const constructionCompletedAt =
      profileBucket === 0 ? addMonths(property.allotmentDate, 30) : profileBucket === 1 ? addMonths(property.allotmentDate, 40) : null;

    const payments: NdcSeedPayment[] = [];

    for (let dueIndex = 0; dueIndex < paidInstallments; dueIndex++) {
      const dueCode = `INSTALLMENT_${dueIndex + 1}`;
      const dueDate = addMonths(property.allotmentDate, (dueIndex + 1) * 6);
      const delayDays = (index + dueIndex) % 2 === 0 ? 0 : 35 + ((index + dueIndex) % 20);
      const paymentDate = addDays(dueDate, delayDays);
      const interest = delayedInterest(
        installmentAmounts[dueIndex],
        dueDate,
        paymentDate,
        annualInterestRatePct
      );
      payments.push({
        dueCode,
        paymentDate,
        amount: round2(installmentAmounts[dueIndex] + interest),
      });
    }

    if (additionalAreaSqyd > 0 && profileBucket === 1) {
      const dueDate = addMonths(property.allotmentDate, 24);
      const paymentDate = addDays(dueDate, 20);
      const base = round2(additionalAreaSqyd * additionalAreaRatePerSqyd);
      const interest = delayedInterest(base, dueDate, paymentDate, annualInterestRatePct);
      payments.push({
        dueCode: "ADDITIONAL_AREA",
        paymentDate,
        amount: round2((base + interest) * 0.45),
      });
    }

    return {
      propertyValue,
      annualInterestRatePct,
      dcfRatePct,
      additionalAreaSqyd,
      additionalAreaRatePerSqyd,
      constructionCompletedAt,
      installmentAmounts,
      payments,
    };
  };

  // 10 properties spread across 5 test citizens and Punjab districts
  const properties: PropertySeed[] = [
    // --- Citizen 1 (Rajesh Kumar) — Mohali (SAS Nagar) ---
    {
      propertyId: uuidv4(),
      upn: "PB-140-001-003-002301",
      authorityId: "PUDA",
      plotNo: "2301",
      schemeName: "PUDA Sector-20 Mohali",
      sectorOrArea: "Sector 20",
      usageType: "RESIDENTIAL",
      propertyType: "PLOT",
      areaSqyd: 200,
      district: "SAS Nagar",
      tehsil: "Mohali",
      village: "Dhakoli",
      khasraNo: "445/2",
      allotteeName: "Rajesh Kumar",
      allotmentRefNo: "PUDA/ALLOT/2015/23456",
      allotmentDate: "2015-03-15",
      outstandingAmount: 0,
      address: { line1: "Plot No. 2301, Sector 20", city: "Mohali", state: "Punjab", pincode: "160020" },
    },
    {
      propertyId: uuidv4(),
      upn: "PB-140-001-005-004512",
      authorityId: "PUDA",
      plotNo: "4512",
      schemeName: "PUDA Industrial Area Phase-8",
      sectorOrArea: "Phase 8",
      usageType: "COMMERCIAL",
      propertyType: "PLOT",
      areaSqyd: 350,
      district: "SAS Nagar",
      tehsil: "Mohali",
      village: "Sahibzada Ajit Singh Nagar",
      khasraNo: "112/1",
      allotteeName: "Rajesh Kumar",
      allotmentRefNo: "PUDA/ALLOT/2018/78901",
      allotmentDate: "2018-11-20",
      outstandingAmount: 12500,
      address: { line1: "Plot No. 4512, Phase 8 Industrial Area", city: "Mohali", state: "Punjab", pincode: "160055" },
    },
    // --- Citizen 2 (Priya Sharma) — Ludhiana ---
    {
      propertyId: uuidv4(),
      upn: "PB-141-002-007-001147",
      authorityId: "GMADA",
      plotNo: "1147",
      schemeName: "Sarabha Nagar Housing Scheme",
      sectorOrArea: "Sarabha Nagar",
      usageType: "RESIDENTIAL",
      propertyType: "PLOT",
      areaSqyd: 180,
      district: "Ludhiana",
      tehsil: "Ludhiana West",
      village: "Sarabha",
      khasraNo: "234/7",
      allotteeName: "Priya Sharma",
      allotmentRefNo: "GMADA/ALLOT/2019/34512",
      allotmentDate: "2019-06-10",
      outstandingAmount: 0,
      address: { line1: "Plot No. 1147, Sarabha Nagar", city: "Ludhiana", state: "Punjab", pincode: "141001" },
    },
    // --- Citizen 3 (Amit Singh) — Amritsar ---
    {
      propertyId: uuidv4(),
      upn: "PB-143-003-011-003278",
      authorityId: "PUDA",
      plotNo: "3278",
      schemeName: "Ranjit Avenue Amritsar",
      sectorOrArea: "Block C",
      usageType: "RESIDENTIAL",
      propertyType: "HOUSE",
      areaSqyd: 250,
      district: "Amritsar",
      tehsil: "Amritsar",
      village: "Sultanwind",
      khasraNo: "567/3",
      allotteeName: "Amit Singh",
      allotmentRefNo: "PUDA/ALLOT/2012/11203",
      allotmentDate: "2012-01-25",
      outstandingAmount: 0,
      address: { line1: "Plot No. 3278, Block C, Ranjit Avenue", city: "Amritsar", state: "Punjab", pincode: "143001" },
    },
    {
      propertyId: uuidv4(),
      upn: "PB-143-003-015-005643",
      authorityId: "PUDA",
      plotNo: "5643",
      schemeName: "Green Avenue Amritsar",
      sectorOrArea: "Phase 2",
      usageType: "RESIDENTIAL",
      propertyType: "PLOT",
      areaSqyd: 100,
      district: "Amritsar",
      tehsil: "Amritsar",
      village: "Verka",
      khasraNo: "89/14",
      allotteeName: "Amit Singh",
      allotmentRefNo: "PUDA/ALLOT/2020/56789",
      allotmentDate: "2020-08-05",
      outstandingAmount: 8000,
      address: { line1: "Plot No. 5643, Phase 2, Green Avenue", city: "Amritsar", state: "Punjab", pincode: "143108" },
    },
    // --- Citizen 4 (Sunita Devi) — Jalandhar ---
    {
      propertyId: uuidv4(),
      upn: "PB-144-004-008-002156",
      authorityId: "PUDA",
      plotNo: "2156",
      schemeName: "Model Town Jalandhar",
      sectorOrArea: "Extension",
      usageType: "RESIDENTIAL",
      propertyType: "PLOT",
      areaSqyd: 175,
      district: "Jalandhar",
      tehsil: "Jalandhar",
      village: "Model Town",
      khasraNo: "321/6",
      allotteeName: "Sunita Devi",
      allotmentRefNo: "PUDA/ALLOT/2016/67890",
      allotmentDate: "2016-04-18",
      outstandingAmount: 0,
      address: { line1: "Plot No. 2156, Model Town Extension", city: "Jalandhar", state: "Punjab", pincode: "144003" },
    },
    {
      propertyId: uuidv4(),
      upn: "PB-144-004-012-007834",
      authorityId: "PUDA",
      plotNo: "7834",
      schemeName: "GT Road Commercial Complex",
      sectorOrArea: "Main GT Road",
      usageType: "COMMERCIAL",
      propertyType: "PLOT",
      areaSqyd: 300,
      district: "Jalandhar",
      tehsil: "Jalandhar",
      village: "Nakodar Road",
      khasraNo: "678/1",
      allotteeName: "Sunita Devi",
      allotmentRefNo: "PUDA/ALLOT/2021/91011",
      allotmentDate: "2021-12-01",
      outstandingAmount: 25000,
      address: { line1: "Plot No. 7834, GT Road", city: "Jalandhar", state: "Punjab", pincode: "144001" },
    },
    // --- Citizen 5 (Vikram Mehta) — Patiala ---
    {
      propertyId: uuidv4(),
      upn: "PB-147-005-002-001089",
      authorityId: "PUDA",
      plotNo: "1089",
      schemeName: "Leela Bhawan Housing Scheme",
      sectorOrArea: "Sector 4",
      usageType: "RESIDENTIAL",
      propertyType: "FLAT",
      areaSqyd: 150,
      district: "Patiala",
      tehsil: "Patiala",
      village: "Leela Bhawan",
      khasraNo: "456/9",
      allotteeName: "Vikram Mehta",
      allotmentRefNo: "PUDA/ALLOT/2017/24680",
      allotmentDate: "2017-07-22",
      outstandingAmount: 0,
      address: { line1: "Flat No. 1089, Sector 4, Leela Bhawan", city: "Patiala", state: "Punjab", pincode: "147001" },
    },
    {
      propertyId: uuidv4(),
      upn: "PB-147-005-009-003421",
      authorityId: "PUDA",
      plotNo: "3421",
      schemeName: "New Housing Board Patiala",
      sectorOrArea: "Sector 9",
      usageType: "RESIDENTIAL",
      propertyType: "PLOT",
      areaSqyd: 120,
      district: "Patiala",
      tehsil: "Patiala",
      village: "Tripuri",
      khasraNo: "789/4",
      allotteeName: "Vikram Mehta",
      allotmentRefNo: "PUDA/ALLOT/2022/13579",
      allotmentDate: "2022-03-30",
      outstandingAmount: 5500,
      address: { line1: "Plot No. 3421, Sector 9, New Housing Board", city: "Patiala", state: "Punjab", pincode: "147002" },
    },
    // Extra: Citizen 1 also has a Patiala property (to demonstrate multi-authority scenario)
    {
      propertyId: uuidv4(),
      upn: "PB-147-005-004-006780",
      authorityId: "PUDA",
      plotNo: "6780",
      schemeName: "Urban Estate Patiala Phase-2",
      sectorOrArea: "Phase 2",
      usageType: "RESIDENTIAL",
      propertyType: "PLOT",
      areaSqyd: 300,
      district: "Patiala",
      tehsil: "Patiala",
      village: "Urban Estate",
      khasraNo: "234/5",
      allotteeName: "Rajesh Kumar",
      allotmentRefNo: "PUDA/ALLOT/2023/99001",
      allotmentDate: "2023-09-14",
      outstandingAmount: 0,
      address: { line1: "Plot No. 6780, Phase 2, Urban Estate", city: "Patiala", state: "Punjab", pincode: "147004" },
    },
  ];

  // citizen_id → property indices mapping
  const citizenPropertyMap: Record<string, number[]> = {
    "test-citizen-1": [0, 1, 9],  // 3 properties for Rajesh (Mohali ×2 + Patiala)
    "test-citizen-2": [2],         // 1 property for Priya (Ludhiana)
    "test-citizen-3": [3, 4],      // 2 properties for Amit (Amritsar ×2)
    "test-citizen-4": [5, 6],      // 2 properties for Sunita (Jalandhar ×2)
    "test-citizen-5": [7, 8],      // 2 properties for Vikram (Patiala ×2)
  };

  // Insert all properties
  for (const [propertyIndex, p] of properties.entries()) {
    const ndcDuesSeed = buildNdcDuesSeed(p, propertyIndex);
    const planningControls = JSON.stringify({ ndc_dues_seed: ndcDuesSeed });

    // Partial unique index can't be used in ON CONFLICT — check/update manually
    const existingProp = await query(
      `SELECT property_id FROM property WHERE authority_id = $1 AND unique_property_number = $2`,
      [p.authorityId, p.upn]
    );
    if (existingProp.rows.length > 0) {
      await query(
        `UPDATE property SET
           property_number = $2, scheme_name = $3, location = $4, sector = $5,
           usage_type = $6, property_type = $7, allottee_name = $8,
           area_sqyd = $9, outstanding_amount = $10, allotment_ref_number = $11,
           allotment_date = $12, planning_controls_jsonb = $13::jsonb, updated_at = NOW()
         WHERE property_id = $1`,
        [existingProp.rows[0].property_id, p.plotNo, p.schemeName, p.sectorOrArea, p.sectorOrArea,
         p.usageType, p.propertyType, p.allotteeName, p.areaSqyd, p.outstandingAmount,
         p.allotmentRefNo, p.allotmentDate, planningControls]
      );
    } else {
    await query(
      `INSERT INTO property (
         property_id, authority_id, unique_property_number, property_number,
         scheme_name, location, sector, usage_type, property_type,
         allotment_ref_number, allotment_date, allottee_name,
         khasra_number, village, tehsil, district,
         area_sqyd, outstanding_amount, property_address_jsonb, planning_controls_jsonb
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14, $15, $16,
         $17, $18, $19::jsonb, $20::jsonb
       )`,
      [
        p.propertyId, p.authorityId, p.upn, p.plotNo,
        p.schemeName, p.sectorOrArea, p.sectorOrArea, p.usageType, p.propertyType,
        p.allotmentRefNo, p.allotmentDate, p.allotteeName,
        p.khasraNo, p.village, p.tehsil, p.district,
        p.areaSqyd, p.outstandingAmount, JSON.stringify(p.address), planningControls,
      ]
    );
    } // end else (new property insert)
  }

  // Link properties to citizens
  for (const [citizenId, indices] of Object.entries(citizenPropertyMap)) {
    for (const idx of indices) {
      const prop = properties[idx];
      // Re-fetch the actual property_id (may differ from uuidv4 if ON CONFLICT hit existing row)
      const row = await query(
        `SELECT property_id FROM property WHERE authority_id = $1 AND unique_property_number = $2`,
        [prop.authorityId, prop.upn]
      );
      if (row.rows.length > 0) {
        const actualId = row.rows[0].property_id;
        await query(
          `INSERT INTO citizen_property (user_id, property_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, property_id) DO NOTHING`,
          [citizenId, actualId]
        );
      }
    }
  }

  console.log(`Properties seeded: ${properties.length} ULPIN properties, linked to 5 test citizens.`);
  console.log("UPN format: PB-{district}-{tehsil}-{village}-{plot_no} (Punjab Bhu-Aadhar / ULPIN)");
}

async function seedHolidays() {
  // B6: Seed national + state holidays for PUDA (2026)
  const holidays: [string, string, string][] = [
    ["2026-01-26", "Republic Day", "PUDA"],
    ["2026-03-10", "Holi", "PUDA"],
    ["2026-03-31", "Eid-ul-Fitr (tentative)", "PUDA"],
    ["2026-04-02", "Ram Navami", "PUDA"],
    ["2026-04-13", "Baisakhi", "PUDA"],
    ["2026-04-14", "Dr. B.R. Ambedkar Jayanti", "PUDA"],
    ["2026-05-01", "May Day", "PUDA"],
    ["2026-06-07", "Eid-ul-Adha (tentative)", "PUDA"],
    ["2026-07-06", "Muharram (tentative)", "PUDA"],
    ["2026-08-15", "Independence Day", "PUDA"],
    ["2026-09-05", "Milad-un-Nabi (tentative)", "PUDA"],
    ["2026-10-02", "Mahatma Gandhi Jayanti", "PUDA"],
    ["2026-10-20", "Dussehra", "PUDA"],
    ["2026-11-09", "Diwali", "PUDA"],
    ["2026-11-10", "Diwali (second day)", "PUDA"],
    ["2026-11-12", "Guru Nanak Jayanti", "PUDA"],
    ["2026-12-25", "Christmas", "PUDA"],
  ];
  for (const [date, desc, authId] of holidays) {
    await query(
      `INSERT INTO authority_holiday (authority_id, holiday_date, description)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [authId, date, desc]
    );
  }
  console.log(`Holidays seeded: ${holidays.length} entries for PUDA 2026.`);
}

async function seedFeatureFlags() {
  const defaults: Array<{
    flagKey: string;
    enabled: boolean;
    rolloutPercentage: number;
    description: string;
    rules: Record<string, unknown>;
  }> = [
    {
      flagKey: "officer_mfa_decision_stepup",
      enabled: false,
      rolloutPercentage: 100,
      description: "Step-up MFA requirement for officer approve/reject task actions",
      rules: {},
    },
  ];

  for (const flag of defaults) {
    await query(
      `INSERT INTO feature_flag
         (flag_key, enabled, rollout_percentage, description, rules_jsonb, updated_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NOW(), NOW())
       ON CONFLICT (flag_key) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             rollout_percentage = EXCLUDED.rollout_percentage,
             description = EXCLUDED.description,
             rules_jsonb = EXCLUDED.rules_jsonb,
             updated_at = NOW()`,
      [
        flag.flagKey,
        flag.enabled,
        flag.rolloutPercentage,
        flag.description,
        JSON.stringify(flag.rules),
      ]
    );
  }
  console.log(`Feature flags seeded: ${defaults.length} default flag(s).`);
}

async function seedComplaints() {
  const { v4: uuidv4 } = await import("uuid");
  const year = new Date().getFullYear();

  // Clean up existing test complaint data
  await query(`DELETE FROM complaint_evidence WHERE complaint_id IN (SELECT complaint_id FROM complaint WHERE user_id LIKE 'test-citizen%')`);
  await query(`DELETE FROM complaint WHERE user_id LIKE 'test-citizen%'`);

  const complaints = [
    {
      complaintId: uuidv4(),
      userId: "test-citizen-1",
      violationType: "UNAUTHORIZED_CONSTRUCTION",
      locationAddress: "Plot No. 234, Phase 7, Mohali",
      locationLocality: "Phase 7",
      locationCity: "Mohali",
      locationDistrict: "SAS Nagar",
      locationPincode: "160062",
      subject: "Multi-storey building without approval",
      description: "A 4-storey residential building is being constructed at Plot No. 234, Phase 7, Mohali without any visible building plan approval board. Construction appears to be ongoing for about 3 weeks. No boundary wall or safety nets installed. This poses a risk to adjacent properties.",
      status: "SUBMITTED",
      daysAgo: 3,
    },
    {
      complaintId: uuidv4(),
      userId: "test-citizen-1",
      violationType: "ENCROACHMENT",
      locationAddress: "Green Belt Area near Sector 68, Mohali",
      locationLocality: "Sector 68",
      locationCity: "Mohali",
      locationDistrict: "SAS Nagar",
      locationPincode: "160068",
      subject: "Commercial encroachment on green belt",
      description: "Several temporary shops and food stalls have encroached on the designated green belt area near Sector 68. The encroachment has been growing over the past month with concrete structures now being built. This is destroying the green area meant for public use.",
      status: "UNDER_REVIEW",
      daysAgo: 10,
    },
  ];

  for (let i = 0; i < complaints.length; i++) {
    const c = complaints[i];
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - c.daysAgo);
    const seq = String(i + 1).padStart(6, "0");
    const complaintNumber = `PUDA/CMP/${year}/${seq}`;

    await query(
      `INSERT INTO complaint (
        complaint_id, complaint_number, user_id, violation_type,
        location_address, location_locality, location_city, location_district, location_pincode,
        subject, description, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      ON CONFLICT (complaint_id) DO NOTHING`,
      [
        c.complaintId,
        complaintNumber,
        c.userId,
        c.violationType,
        c.locationAddress,
        c.locationLocality,
        c.locationCity,
        c.locationDistrict,
        c.locationPincode,
        c.subject,
        c.description,
        c.status,
        createdDate.toISOString(),
      ]
    );
  }

  // Reset sequence to avoid conflicts with seeded data
  await query(`SELECT setval('complaint_number_seq', 100, false)`);

  console.log(`Complaints seeded: ${complaints.length} test complaints for citizen-1.`);
}

async function main() {
  console.log("Seeding...");
  await seedAuthorities();
  await seedSystemRoles();
  await seedDesignationsAndMappings();
  await seedServiceVersions();
  await seedUsers();
  await seedUserPosting();
  await seedHolidays();
  await seedFeatureFlags();
  await seedProperties();       // Must run before seedCitizenApplications so applications can reference real UPNs
  await seedCitizenApplications();
  await seedComplaints();
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
