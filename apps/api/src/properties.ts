/**
 * Property DAL — first-class property entity management.
 *
 * The property table is a shared master entity: one row per physical
 * property identified by (authority_id, unique_property_number).
 * Multiple applications can reference the same property.
 */
import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyRow {
  property_id: string;
  authority_id: string;
  unique_property_number: string | null;
  property_number: string | null;
  location: string | null;
  sector: string | null;
  scheme_name: string | null;
  usage_type: string | null;
  property_type: string | null;
  allotment_ref_type: string | null;
  allotment_ref_number: string | null;
  allotment_date: string | null;
  allottee_name: string | null;
  khasra_number: string | null;
  village: string | null;
  tehsil: string | null;
  district: string | null;
  area_sqyd: number | null;
  area_sqm: number | null;
  physical_jsonb: Record<string, unknown>;
  planning_controls_jsonb: Record<string, unknown>;
  ledger_account_id: string | null;
  outstanding_amount: number | null;
  property_address_jsonb: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Shape accepted by upsertPropertyFromApplication.
 * Matches what comes from data_jsonb.property in existing service-pack forms
 * AND from the Data Model.md Property schema.
 */
export interface PropertyInput {
  // From existing forms
  upn?: string;
  plot_no?: string;
  scheme_name?: string;
  area_sqyd?: number;
  authority_name?: string;
  type?: string;

  // From Data Model.md full schema (camelCase)
  authority?: string;
  location?: string;
  sector?: string;
  usageType?: string;
  propertyType?: string;
  propertyNumber?: string;
  uniquePropertyNumber?: string;
  allotment?: {
    referenceType?: string;
    referenceNumber?: string;
    allotmentDate?: string;
    allotteeNameAsPerRecord?: string;
  };
  revenueDetails?: {
    khasraNumber?: string;
    village?: string;
    tehsil?: string;
    district?: string;
  };
  physical?: {
    plotAreaSqm?: number;
    cornerPlot?: boolean;
    dimensions?: Record<string, unknown>;
    boundaries?: Record<string, unknown>;
  };
  planningControls?: Record<string, unknown>;
  financialLedger?: {
    accountId?: string;
    outstandingAmount?: number;
  };
  propertyAddress?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers — normalise form keys → DB columns
// ---------------------------------------------------------------------------

function normalise(input: PropertyInput, authorityId: string) {
  return {
    authority_id: authorityId,
    unique_property_number: input.upn || input.uniquePropertyNumber || null,
    property_number: input.plot_no || input.propertyNumber || null,
    location: input.location || null,
    sector: input.sector || null,
    scheme_name: input.scheme_name || null,
    usage_type: input.usageType || input.type || null,
    property_type: input.propertyType || input.type || null,
    allotment_ref_type: input.allotment?.referenceType || null,
    allotment_ref_number: input.allotment?.referenceNumber || null,
    allotment_date: input.allotment?.allotmentDate || null,
    allottee_name: input.allotment?.allotteeNameAsPerRecord || null,
    khasra_number: input.revenueDetails?.khasraNumber || null,
    village: input.revenueDetails?.village || null,
    tehsil: input.revenueDetails?.tehsil || null,
    district: input.revenueDetails?.district || null,
    area_sqyd: input.area_sqyd ?? null,
    area_sqm: input.physical?.plotAreaSqm ?? null,
    physical_jsonb: input.physical
      ? JSON.stringify(input.physical)
      : "{}",
    planning_controls_jsonb: input.planningControls
      ? JSON.stringify(input.planningControls)
      : "{}",
    ledger_account_id: input.financialLedger?.accountId || null,
    outstanding_amount: input.financialLedger?.outstandingAmount ?? null,
    property_address_jsonb: input.propertyAddress
      ? JSON.stringify(input.propertyAddress)
      : "{}",
  };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Upsert a property from application data and link it to the application.
 *
 * If the property already exists (matched by authority_id + UPN), it is
 * updated with any new non-null values. Otherwise a new row is created.
 *
 * Returns the property_id.
 */
export async function upsertPropertyFromApplication(
  arn: string,
  authorityId: string,
  propertyData: PropertyInput,
  client?: PoolClient,
  /** If provided, auto-link the property to this citizen for future UPN picker use */
  applicantUserId?: string
): Promise<string> {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;

  const norm = normalise(propertyData, authorityId);

  let propertyId: string | null = null;

  // Try to find existing property by authority + UPN
  if (norm.unique_property_number) {
    const existing = await run(
      `SELECT property_id FROM property
       WHERE authority_id = $1 AND unique_property_number = $2
       LIMIT 1`,
      [authorityId, norm.unique_property_number]
    );
    if (existing.rows.length > 0) {
      propertyId = existing.rows[0].property_id;

      // Update with any new non-null values
      await run(
        `UPDATE property SET
           property_number       = COALESCE($2,  property_number),
           location              = COALESCE($3,  location),
           sector                = COALESCE($4,  sector),
           scheme_name           = COALESCE($5,  scheme_name),
           usage_type            = COALESCE($6,  usage_type),
           property_type         = COALESCE($7,  property_type),
           allotment_ref_type    = COALESCE($8,  allotment_ref_type),
           allotment_ref_number  = COALESCE($9,  allotment_ref_number),
           allotment_date        = COALESCE($10, allotment_date),
           allottee_name         = COALESCE($11, allottee_name),
           khasra_number         = COALESCE($12, khasra_number),
           village               = COALESCE($13, village),
           tehsil                = COALESCE($14, tehsil),
           district              = COALESCE($15, district),
           area_sqyd             = COALESCE($16, area_sqyd),
           area_sqm              = COALESCE($17, area_sqm),
           physical_jsonb        = CASE WHEN $18::jsonb != '{}'::jsonb THEN $18::jsonb ELSE physical_jsonb END,
           planning_controls_jsonb = CASE WHEN $19::jsonb != '{}'::jsonb THEN $19::jsonb ELSE planning_controls_jsonb END,
           ledger_account_id     = COALESCE($20, ledger_account_id),
           outstanding_amount    = COALESCE($21, outstanding_amount),
           property_address_jsonb = CASE WHEN $22::jsonb != '{}'::jsonb THEN $22::jsonb ELSE property_address_jsonb END,
           updated_at            = NOW()
         WHERE property_id = $1`,
        [
          propertyId,
          norm.property_number,
          norm.location,
          norm.sector,
          norm.scheme_name,
          norm.usage_type,
          norm.property_type,
          norm.allotment_ref_type,
          norm.allotment_ref_number,
          norm.allotment_date,
          norm.allottee_name,
          norm.khasra_number,
          norm.village,
          norm.tehsil,
          norm.district,
          norm.area_sqyd,
          norm.area_sqm,
          norm.physical_jsonb,
          norm.planning_controls_jsonb,
          norm.ledger_account_id,
          norm.outstanding_amount,
          norm.property_address_jsonb,
        ]
      );
    }
  }

  // Create new property if not found
  if (!propertyId) {
    propertyId = uuidv4();
    await run(
      `INSERT INTO property (
         property_id, authority_id, unique_property_number, property_number,
         location, sector, scheme_name, usage_type, property_type,
         allotment_ref_type, allotment_ref_number, allotment_date, allottee_name,
         khasra_number, village, tehsil, district,
         area_sqyd, area_sqm, physical_jsonb, planning_controls_jsonb,
         ledger_account_id, outstanding_amount, property_address_jsonb
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20::jsonb, $21::jsonb,
         $22, $23, $24::jsonb
       )`,
      [
        propertyId,
        norm.authority_id,
        norm.unique_property_number,
        norm.property_number,
        norm.location,
        norm.sector,
        norm.scheme_name,
        norm.usage_type,
        norm.property_type,
        norm.allotment_ref_type,
        norm.allotment_ref_number,
        norm.allotment_date,
        norm.allottee_name,
        norm.khasra_number,
        norm.village,
        norm.tehsil,
        norm.district,
        norm.area_sqyd,
        norm.area_sqm,
        norm.physical_jsonb,
        norm.planning_controls_jsonb,
        norm.ledger_account_id,
        norm.outstanding_amount,
        norm.property_address_jsonb,
      ]
    );
  }

  // Link application → property (idempotent)
  await run(
    `INSERT INTO application_property (arn, property_id)
     VALUES ($1, $2)
     ON CONFLICT (arn, property_id) DO NOTHING`,
    [arn, propertyId]
  );

  // Auto-link property to citizen for future UPN picker use (idempotent)
  if (applicantUserId && propertyId) {
    try {
      await linkPropertyToCitizen(applicantUserId, propertyId, client ?? undefined);
    } catch {
      // non-fatal — property link is a convenience, not critical
    }
  }

  return propertyId;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

const PROPERTY_COLUMNS = `
  property_id, authority_id, unique_property_number, property_number,
  location, sector, scheme_name, usage_type, property_type,
  allotment_ref_type, allotment_ref_number, allotment_date, allottee_name,
  khasra_number, village, tehsil, district,
  area_sqyd, area_sqm, physical_jsonb, planning_controls_jsonb,
  ledger_account_id, outstanding_amount, property_address_jsonb,
  created_at, updated_at
`;

function rowToProperty(row: any): PropertyRow {
  return {
    property_id: row.property_id,
    authority_id: row.authority_id,
    unique_property_number: row.unique_property_number,
    property_number: row.property_number,
    location: row.location,
    sector: row.sector,
    scheme_name: row.scheme_name,
    usage_type: row.usage_type,
    property_type: row.property_type,
    allotment_ref_type: row.allotment_ref_type,
    allotment_ref_number: row.allotment_ref_number,
    allotment_date: row.allotment_date,
    allottee_name: row.allottee_name,
    khasra_number: row.khasra_number,
    village: row.village,
    tehsil: row.tehsil,
    district: row.district,
    area_sqyd: row.area_sqyd ? parseFloat(row.area_sqyd) : null,
    area_sqm: row.area_sqm ? parseFloat(row.area_sqm) : null,
    physical_jsonb: row.physical_jsonb || {},
    planning_controls_jsonb: row.planning_controls_jsonb || {},
    ledger_account_id: row.ledger_account_id,
    outstanding_amount: row.outstanding_amount ? parseFloat(row.outstanding_amount) : null,
    property_address_jsonb: row.property_address_jsonb || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Look up a property by ID. */
export async function getPropertyById(propertyId: string): Promise<PropertyRow | null> {
  const result = await query(
    `SELECT ${PROPERTY_COLUMNS} FROM property WHERE property_id = $1`,
    [propertyId]
  );
  return result.rows.length > 0 ? rowToProperty(result.rows[0]) : null;
}

/** Look up a property by authority + UPN. */
export async function getPropertyByUPN(
  authorityId: string,
  upn: string
): Promise<PropertyRow | null> {
  const result = await query(
    `SELECT ${PROPERTY_COLUMNS} FROM property
     WHERE authority_id = $1 AND unique_property_number = $2
     LIMIT 1`,
    [authorityId, upn]
  );
  return result.rows.length > 0 ? rowToProperty(result.rows[0]) : null;
}

/** Get the property linked to a given application. */
export async function getPropertyForApplication(arn: string): Promise<PropertyRow | null> {
  const result = await query(
    `SELECT p.${PROPERTY_COLUMNS.replace(/\n/g, "")}
     FROM property p
     JOIN application_property ap ON p.property_id = ap.property_id
     WHERE ap.arn = $1
     LIMIT 1`,
    [arn]
  );
  return result.rows.length > 0 ? rowToProperty(result.rows[0]) : null;
}

/** Get all applications linked to a property. */
export async function getApplicationsForProperty(
  propertyId: string
): Promise<Array<{ arn: string; public_arn: string | null; service_key: string; state_id: string; created_at: Date }>> {
  const result = await query(
    `SELECT a.arn, a.public_arn, a.service_key, a.state_id, a.created_at
     FROM application a
     JOIN application_property ap ON a.arn = ap.arn
     WHERE ap.property_id = $1
     ORDER BY a.created_at DESC`,
    [propertyId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Citizen ↔ Property ownership
// ---------------------------------------------------------------------------

/**
 * Link a property directly to a citizen (ownership/holding record).
 * Idempotent — safe to call multiple times with the same pair.
 */
export async function linkPropertyToCitizen(
  userId: string,
  propertyId: string,
  client?: PoolClient
): Promise<void> {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;
  await run(
    `INSERT INTO citizen_property (user_id, property_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, property_id) DO NOTHING`,
    [userId, propertyId]
  );
}

/**
 * Return all properties owned/held by a citizen, ordered by UPN.
 * Used to populate the UPN picker on the citizen portal.
 */
export async function getCitizenProperties(userId: string): Promise<PropertyRow[]> {
  const prefixedColumns = PROPERTY_COLUMNS.trim()
    .split(",")
    .map((c) => `p.${c.trim()}`)
    .join(", ");
  const result = await query(
    `SELECT ${prefixedColumns}
     FROM property p
     JOIN citizen_property cp ON p.property_id = cp.property_id
     WHERE cp.user_id = $1
     ORDER BY p.unique_property_number ASC`,
    [userId]
  );
  return result.rows.map(rowToProperty);
}

/** Search properties by authority + optional filters (scheme, plot, UPN prefix). */
export async function searchProperties(
  authorityId: string,
  filters?: { schemeName?: string; plotNo?: string; upnPrefix?: string },
  limit = 50,
  offset = 0
): Promise<PropertyRow[]> {
  const conditions: string[] = ["authority_id = $1"];
  const params: unknown[] = [authorityId];
  let idx = 2;

  if (filters?.schemeName) {
    conditions.push(`scheme_name ILIKE $${idx}`);
    params.push(`%${filters.schemeName}%`);
    idx++;
  }
  if (filters?.plotNo) {
    conditions.push(`property_number = $${idx}`);
    params.push(filters.plotNo);
    idx++;
  }
  if (filters?.upnPrefix) {
    conditions.push(`unique_property_number ILIKE $${idx}`);
    params.push(`${filters.upnPrefix}%`);
    idx++;
  }

  params.push(limit, offset);
  const sql = `SELECT ${PROPERTY_COLUMNS} FROM property
    WHERE ${conditions.join(" AND ")}
    ORDER BY updated_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}`;

  const result = await query(sql, params);
  return result.rows.map(rowToProperty);
}
