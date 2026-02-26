import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import { executeTransition } from "./workflow";
import { validateForSubmission, CURRENT_SCHEMA_VERSION } from "@puda/shared";
import { upsertPropertyFromApplication } from "./properties";
import type { PoolClient } from "pg";
import { ensureApplicantProfileComplete } from "./profile";
import { logWarn } from "./logger";
import { resolveActiveVersion } from "./service-version";

export interface Application {
  arn: string;
  public_arn?: string;
  service_key: string;
  service_version: string;
  authority_id: string;
  applicant_user_id?: string;
  state_id: string;
  data_jsonb: any;
  row_version: number;
  created_at: Date;
  submitted_at?: Date;
  disposed_at?: Date;
  disposal_type?: string;
  sla_due_at?: Date;
  sla_paused_at?: Date;
  submission_channel?: string;
  assisted_by_user_id?: string;
}

type MutationActorType = "CITIZEN" | "OFFICER" | "ADMIN";

function ensureCitizenOwnsApplication(
  app: Application,
  userId: string,
  actorType: MutationActorType
): void {
  if (actorType !== "CITIZEN") return;
  if (!app.applicant_user_id || app.applicant_user_id !== userId) {
    throw new Error("FORBIDDEN");
  }
}

function deepMerge(target: any, source: any): any {
  if (source === null || source === undefined) return target;
  if (typeof source !== "object" || Array.isArray(source)) {
    return source;
  }
  const result = Array.isArray(target) ? [...target] : { ...(target || {}) };
  for (const [key, value] of Object.entries(source)) {
    result[key] = deepMerge((result as any)[key], value);
  }
  return result;
}

function collectLeafKeys(value: any, prefix = ""): string[] {
  if (value === null || value === undefined) {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(value) || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [key, nested] of entries) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    keys.push(...collectLeafKeys(nested, nextPrefix));
  }
  return keys;
}

type RuleDefinition = {
  ruleId: string;
  description?: string;
  logic: any;
};

type SubmissionValidationMode = "warn" | "enforce";

type ServiceConfig = {
  submissionValidation?: {
    propertyRequired?: boolean;
    enforcementMode?: SubmissionValidationMode;
  };
  documents?: { documentTypes?: Array<{ docTypeId: string; mandatory?: boolean; requiredWhenRuleId?: string }> };
  rules?: { rules?: RuleDefinition[] };
};

function getSubmissionValidationPolicy(config: ServiceConfig): {
  requireProperty: boolean;
  enforcementMode: SubmissionValidationMode;
} {
  const policy = config.submissionValidation || {};
  return {
    // Conservative default for legacy configs without explicit policy.
    requireProperty: policy.propertyRequired ?? true,
    enforcementMode: policy.enforcementMode === "enforce" ? "enforce" : "warn",
  };
}

function getVarValue(context: any, path: string | undefined, defaultValue?: any): any {
  if (!path) return defaultValue;
  const parts = path.split(".");
  let current = context;
  for (const part of parts) {
    if (current == null) return defaultValue;
    current = current[part];
  }
  return current === undefined ? defaultValue : current;
}

function evaluateLogic(logic: any, context: any): any {
  if (logic === null || logic === undefined) return logic;
  if (Array.isArray(logic)) {
    return logic.map((item) => evaluateLogic(item, context));
  }
  if (typeof logic !== "object") {
    return logic;
  }
  const entries = Object.entries(logic);
  if (entries.length === 0) return false;
  const [op, value] = entries[0];
  switch (op) {
    case "var": {
      if (Array.isArray(value)) {
        return getVarValue(context, value[0], value[1]);
      }
      return getVarValue(context, value as string);
    }
    case "==": {
      const [a, b] = value as any[];
      return evaluateLogic(a, context) == evaluateLogic(b, context);
    }
    case "!=": {
      const [a, b] = value as any[];
      return evaluateLogic(a, context) != evaluateLogic(b, context);
    }
    case "and": {
      const list = (value as any[]).map((v) => evaluateLogic(v, context));
      for (const item of list) {
        if (!item) return item;
      }
      return list[list.length - 1];
    }
    case "or": {
      const list = (value as any[]).map((v) => evaluateLogic(v, context));
      for (const item of list) {
        if (item) return item;
      }
      return list[list.length - 1];
    }
    case "not":
      return !evaluateLogic(value, context);
    default:
      return false;
  }
}

async function loadServiceConfig(
  serviceKey: string,
  serviceVersion: string,
  client?: PoolClient
): Promise<ServiceConfig> {
  const runner = client ? (text: string, params?: any[]) => client.query(text, params) : query;
  const configResult = await runner(
    "SELECT config_jsonb FROM service_version WHERE service_key = $1 AND version = $2",
    [serviceKey, serviceVersion]
  );
  if (configResult.rows.length === 0) {
    throw new Error("CONFIG_NOT_FOUND");
  }
  const raw = configResult.rows[0].config_jsonb;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ServiceConfig;
    } catch {
      return {};
    }
  }
  return raw as ServiceConfig;
}

async function validateRequiredDocuments(
  arn: string,
  config: ServiceConfig,
  context: any,
  client: PoolClient
): Promise<void> {
  const docs = config.documents?.documentTypes || [];
  if (docs.length === 0) return;
  const rules = config.rules?.rules || [];
  const rulesById = new Map(rules.map((r) => [r.ruleId, r]));

  const requiredDocTypeIds = docs
    .filter((doc) => {
      if (doc.mandatory) return true;
      if (doc.requiredWhenRuleId) {
        const rule = rulesById.get(doc.requiredWhenRuleId);
        if (!rule) return false;
        return Boolean(evaluateLogic(rule.logic, context));
      }
      return false;
    })
    .map((doc) => doc.docTypeId);

  if (requiredDocTypeIds.length === 0) return;

  const existingResult = await client.query(
    "SELECT doc_type_id FROM application_document WHERE arn = $1 AND is_current = TRUE UNION SELECT doc_type_id FROM document WHERE arn = $1 AND is_current = TRUE",
    [arn]
  );
  const existing = new Set(existingResult.rows.map((row) => row.doc_type_id));
  const missing = requiredDocTypeIds.filter((docId) => !existing.has(docId));
  if (missing.length > 0) {
    throw new Error(`MISSING_DOCUMENTS:${missing.join(",")}`);
  }
}

export async function resolveArn(arnOrPublic: string): Promise<string | null> {
  const result = await query(
    "SELECT arn FROM application WHERE arn = $1 OR public_arn = $1",
    [arnOrPublic]
  );
  return result.rows[0]?.arn || null;
}

export async function createApplication(
  authorityId: string,
  serviceKey: string,
  applicantUserId?: string,
  initialData?: any,
  submissionChannel?: string,
  assistedByUserId?: string
): Promise<Application> {
  const year = new Date().getFullYear();
  const seqResult = await query("SELECT nextval('arn_seq') AS seq");
  const seq = String(seqResult.rows[0].seq).padStart(6, "0");
  const arn = `${authorityId}/${year}/DFT/${seq}`;
  
  // Get currently-active published version (respects effective_from/effective_to)
  const serviceVersion = await resolveActiveVersion(serviceKey);
  if (!serviceVersion) {
    throw new Error("SERVICE_NOT_FOUND");
  }
  const channel = submissionChannel || "SELF";

  let dataPayload = initialData || {};
  if (applicantUserId) {
    const applicantProfile = await ensureApplicantProfileComplete(applicantUserId);
    dataPayload = { ...dataPayload, applicant: applicantProfile };
  }

  // Stamp schema versioning and tenancy into data_jsonb at creation time
  const dataWithMeta = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    serviceVersion,
    tenantId: authorityId,
    ...(dataPayload || {}),
  };
  
  await query(
    "INSERT INTO application (arn, public_arn, service_key, service_version, authority_id, applicant_user_id, state_id, data_jsonb, submission_channel, assisted_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9)",
    [arn, arn, serviceKey, serviceVersion, authorityId, applicantUserId || null, JSON.stringify(dataWithMeta), channel, assistedByUserId || null]
  );
  
  // Create audit event
  await query(
    "INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      uuidv4(),
      arn,
      "APPLICATION_CREATED",
      applicantUserId ? "CITIZEN" : "SYSTEM",
      applicantUserId || null,
      JSON.stringify({ serviceKey, authorityId, submissionChannel: channel, assistedByUserId })
    ]
  );

  // Extract property from initial data → property table (best-effort)
  const propertyData = dataPayload?.property;
  if (propertyData && typeof propertyData === "object" && Object.keys(propertyData).length > 0) {
    try {
      await upsertPropertyFromApplication(arn, authorityId, propertyData, undefined, applicantUserId || undefined);
    } catch (propErr: any) {
      logWarn("Property upsert failed during application create", {
        arn,
        error: propErr?.message || "unknown_error",
      });
    }
  }
  
  const created = await getApplication(arn);
  if (!created) throw new Error("Failed to create application");
  return created;
}

export async function getApplication(arn: string): Promise<Application | null> {
  const result = await query(
    "SELECT arn, public_arn, service_key, service_version, authority_id, applicant_user_id, state_id, data_jsonb, row_version, created_at, submitted_at, disposed_at, disposal_type, sla_due_at, sla_paused_at, submission_channel, assisted_by_user_id FROM application WHERE arn = $1 OR public_arn = $1",
    [arn]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    arn: row.arn,
    public_arn: row.public_arn,
    service_key: row.service_key,
    service_version: row.service_version,
    authority_id: row.authority_id,
    applicant_user_id: row.applicant_user_id,
    state_id: row.state_id,
    data_jsonb: row.data_jsonb,
    row_version: row.row_version,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    disposed_at: row.disposed_at,
    disposal_type: row.disposal_type,
    sla_due_at: row.sla_due_at,
    sla_paused_at: row.sla_paused_at,
    submission_channel: row.submission_channel,
    assisted_by_user_id: row.assisted_by_user_id
  };
}

/**
 * Update application data_jsonb with optimistic concurrency control.
 *
 * @param expectedRowVersion — if supplied, the update will fail with
 *   CONFLICT if the row has been modified since the caller last read it.
 *   This prevents silent last-write-wins overwrites in multi-user scenarios.
 */
export async function updateApplicationData(
  arn: string,
  data: any,
  userId: string,
  expectedRowVersion?: number,
  actorType: MutationActorType = "CITIZEN"
): Promise<Application> {
  const app = await getApplication(arn);
  if (!app) throw new Error("Application not found");
  ensureCitizenOwnsApplication(app, userId, actorType);
  if (app.state_id !== "DRAFT") {
    throw new Error("INVALID_STATE");
  }
  const internalArn = app.arn;
  let nextData = data;
  if (app.applicant_user_id) {
    const applicantProfile = await ensureApplicantProfileComplete(app.applicant_user_id);
    nextData = { ...(data || {}), applicant: applicantProfile };
  }

  // Optimistic concurrency check: if the caller provides an expected row version,
  // only proceed if it matches the current version in DB.
  if (expectedRowVersion !== undefined && expectedRowVersion !== app.row_version) {
    throw new Error("CONFLICT");
  }

  const result = await query(
    "UPDATE application SET data_jsonb = $1, row_version = row_version + 1, updated_at = NOW() WHERE arn = $2 AND row_version = $3 RETURNING row_version",
    [JSON.stringify(nextData), internalArn, app.row_version]
  );

  if (result.rowCount === 0) {
    // Another writer incremented row_version between our SELECT and UPDATE
    throw new Error("CONFLICT");
  }
  
  // Create audit event
  await query(
    "INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      uuidv4(),
      internalArn,
      "APPLICATION_UPDATED",
      "CITIZEN",
      userId,
      JSON.stringify({ changedFields: Object.keys(nextData || {}) })
    ]
  );
  
  const updated = await getApplication(internalArn);
  if (!updated) throw new Error("Application not found");
  return updated;
}

export async function submitApplication(
  arn: string,
  userId: string,
  actorType: MutationActorType = "CITIZEN"
): Promise<{ arn: string; submittedArn: string }> {
  const app = await getApplication(arn);
  if (!app) {
    throw new Error("APPLICATION_NOT_FOUND");
  }
  ensureCitizenOwnsApplication(app, userId, actorType);
  
  if (app.state_id !== "DRAFT") {
    throw new Error("INVALID_STATE");
  }
  if (app.applicant_user_id) {
    await ensureApplicantProfileComplete(app.applicant_user_id);
  }

  const serviceConfig = await loadServiceConfig(app.service_key, app.service_version);
  const validationPolicy = getSubmissionValidationPolicy(serviceConfig);

  // Validate data_jsonb against master application model
  const validationResult = validateForSubmission(app.data_jsonb, {
    requireProperty: validationPolicy.requireProperty,
  });
  if (!validationResult.success) {
    const messages = (validationResult.errors || [])
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    if (validationPolicy.enforcementMode === "enforce") {
      throw new Error(`VALIDATION_FAILED:${messages}`);
    }
    logWarn("Submission validation warnings", { arn, messages });
  }
  
  const client = await getClient();
  try {
    await client.query("BEGIN");

    await validateRequiredDocuments(app.arn, serviceConfig, { data: app.data_jsonb }, client);

    // Extract property from data_jsonb → property table (if property section exists)
    const propertyData = app.data_jsonb?.property;
    if (propertyData && typeof propertyData === "object" && Object.keys(propertyData).length > 0) {
      try {
        await upsertPropertyFromApplication(app.arn, app.authority_id, propertyData, client, app.applicant_user_id || undefined);
      } catch (propErr: any) {
        logWarn("Property upsert failed during submit", {
          arn,
          error: propErr?.message || "unknown_error",
        });
        // Non-blocking: don't fail submission if property extraction fails
      }
    }

    // Create submitted ARN from DB sequence — collision-safe
    const year = new Date().getFullYear();
    const seqResult = await client.query("SELECT nextval('arn_seq') AS seq");
    const seq = String(seqResult.rows[0].seq).padStart(6, "0");
    const submittedArn = `${app.authority_id}/${year}/${seq}`;
    
    // Update application (arn and submission metadata; state stays DRAFT until transition)
    await client.query(
      "UPDATE application SET public_arn = $1, submitted_at = NOW(), submission_snapshot_jsonb = data_jsonb, row_version = row_version + 1 WHERE arn = $2",
      [submittedArn, app.arn]
    );
    
    // Execute submit transition (DRAFT -> SUBMITTED) in same transaction
    const transitionResult = await executeTransition(
      app.arn,
      "SUBMIT",
      userId,
      "CITIZEN",
      [],
      undefined,
      {},
      client
    );
    
    if (!transitionResult.success) {
      throw new Error(transitionResult.error || "TRANSITION_FAILED");
    }
    
    // Run system transition to create first task (SUBMITTED -> PENDING_AT_CLERK)
    const assignResult = await executeTransition(
      app.arn,
      "ASSIGN_CLERK",
      "system",
      "SYSTEM",
      [],
      undefined,
      {},
      client
    );
    if (!assignResult.success && assignResult.error !== "TRANSITION_NOT_FOUND") {
      throw new Error(assignResult.error || "ASSIGN_CLERK_FAILED");
    }
    
    await client.query("COMMIT");
    
    return { arn: app.arn, submittedArn };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function respondToQuery(
  arn: string,
  queryId: string,
  responseMessage: string,
  updatedData: any,
  userId: string,
  actorType: MutationActorType = "CITIZEN"
): Promise<void> {
  const app = await getApplication(arn);
  if (!app) {
    throw new Error("APPLICATION_NOT_FOUND");
  }
  ensureCitizenOwnsApplication(app, userId, actorType);
  const internalArn = app.arn;
  if (app.state_id !== "QUERY_PENDING") {
    throw new Error("INVALID_STATE");
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const queryResult = await client.query(
      "SELECT status, unlocked_field_keys FROM query WHERE query_id = $1 AND arn = $2",
      [queryId, internalArn]
    );
    if (queryResult.rows.length === 0) {
      throw new Error("QUERY_NOT_FOUND");
    }
    const queryRow = queryResult.rows[0];
    if (queryRow.status !== "PENDING") {
      throw new Error("QUERY_NOT_PENDING");
    }
    const unlockedFields: string[] = Array.isArray(queryRow.unlocked_field_keys)
      ? queryRow.unlocked_field_keys
      : [];
    if (updatedData && typeof updatedData === "object") {
      const updatedKeys = collectLeafKeys(updatedData);
      const applicantChanges = updatedKeys.filter((key) => key.startsWith("applicant."));
      if (applicantChanges.length > 0) {
        throw new Error("APPLICANT_FIELDS_READ_ONLY");
      }
      const disallowed = updatedKeys.filter((key) => !unlockedFields.includes(key));
      if (disallowed.length > 0) {
        throw new Error(`FIELDS_NOT_UNLOCKED:${disallowed.join(",")}`);
      }
    } else if (updatedData && updatedData !== null) {
      throw new Error("INVALID_UPDATED_DATA");
    }

    // Update query
    await client.query(
      "UPDATE query SET status = 'RESPONDED', responded_at = NOW(), response_remarks = $1 WHERE query_id = $2 AND arn = $3",
      [responseMessage, queryId, internalArn]
    );
    
    // Update application data if provided (inside transaction — row already locked via FOR UPDATE in executeTransition)
    if (updatedData && Object.keys(updatedData).length > 0) {
      if (app) {
        const mergedData = deepMerge(app.data_jsonb, updatedData);
        await client.query(
          "UPDATE application SET data_jsonb = $1, row_version = row_version + 1, updated_at = NOW() WHERE arn = $2",
          [JSON.stringify(mergedData), internalArn]
        );
      }
    }
    
    // Resume SLA
    await client.query(
      "UPDATE application SET sla_paused_at = NULL WHERE arn = $1",
      [internalArn]
    );
    
    // Execute resubmit transition in same transaction
    const transitionResult = await executeTransition(internalArn, "QUERY_RESPOND", userId, "CITIZEN", [], responseMessage, {}, client);
    if (!transitionResult.success) {
      throw new Error(transitionResult.error || "QUERY_RESPOND_FAILED");
    }

    const routeResult = await executeTransition(internalArn, "RESUBMIT_ROUTE", "system", "SYSTEM", [], undefined, {}, client);
    if (!routeResult.success && routeResult.error !== "TRANSITION_NOT_FOUND") {
      throw new Error(routeResult.error || "RESUBMIT_ROUTE_FAILED");
    }
    
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getUserApplications(
  userId: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<Application[]> {
  let sql = "SELECT arn, public_arn, service_key, service_version, authority_id, applicant_user_id, state_id, data_jsonb, row_version, created_at, submitted_at, disposed_at, disposal_type, sla_due_at, sla_paused_at FROM application WHERE applicant_user_id = $1";
  const params: any[] = [userId];
  
  if (status) {
    sql += " AND state_id = $2";
    params.push(status);
    sql += " ORDER BY created_at DESC LIMIT $3 OFFSET $4";
    params.push(limit, offset);
  } else {
    sql += " ORDER BY created_at DESC LIMIT $2 OFFSET $3";
    params.push(limit, offset);
  }
  
  const result = await query(sql, params);
  return result.rows.map(row => ({
    arn: row.arn,
    public_arn: row.public_arn,
    service_key: row.service_key,
    service_version: row.service_version,
    authority_id: row.authority_id,
    applicant_user_id: row.applicant_user_id,
    state_id: row.state_id,
    data_jsonb: row.data_jsonb,
    row_version: row.row_version,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    disposed_at: row.disposed_at,
    disposal_type: row.disposal_type,
    sla_due_at: row.sla_due_at,
    sla_paused_at: row.sla_paused_at
  }));
}

// L3: Consolidated into a single query instead of 4 separate ones
export async function getUserApplicationStats(userId: string): Promise<{
  total: number;
  active: number;
  pendingAction: number;
  approved: number;
}> {
  const result = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE state_id NOT IN ('APPROVED', 'REJECTED', 'CLOSED')) as active,
       COUNT(*) FILTER (WHERE state_id = 'QUERY_PENDING') as pending_action,
       COUNT(*) FILTER (WHERE state_id = 'APPROVED') as approved
     FROM application
     WHERE applicant_user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  return {
    total: parseInt(row.total),
    active: parseInt(row.active),
    pendingAction: parseInt(row.pending_action),
    approved: parseInt(row.approved),
  };
}

export async function searchApplications(
  authorityId?: string,
  searchTerm?: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<Application[]> {
  let sql = `
    SELECT 
      arn, public_arn, service_key, service_version, authority_id, applicant_user_id, 
      state_id, data_jsonb, row_version, created_at, submitted_at, disposed_at, 
      disposal_type, sla_due_at, sla_paused_at, submission_channel, assisted_by_user_id
    FROM application
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIndex = 1;

  if (authorityId) {
    sql += ` AND authority_id = $${paramIndex}`;
    params.push(authorityId);
    paramIndex++;
  }

  if (status) {
    sql += ` AND state_id = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (searchTerm) {
    // PERF-001: Use concatenated expression matching idx_application_search_text_trgm
    const searchPattern = `%${searchTerm}%`;
    sql += ` AND (
      COALESCE(public_arn, '') || ' ' ||
      arn || ' ' ||
      COALESCE(data_jsonb->'applicant'->>'full_name', '') || ' ' ||
      COALESCE(data_jsonb->'applicant'->>'name', '') || ' ' ||
      COALESCE(data_jsonb->'property'->>'upn', '') || ' ' ||
      COALESCE(data_jsonb->'property'->>'plot_no', '') || ' ' ||
      COALESCE(data_jsonb->'property'->>'scheme_name', '')
    ) ILIKE $${paramIndex}`;
    params.push(searchPattern);
    paramIndex++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows.map(row => ({
    arn: row.arn,
    public_arn: row.public_arn,
    service_key: row.service_key,
    service_version: row.service_version,
    authority_id: row.authority_id,
    applicant_user_id: row.applicant_user_id,
    state_id: row.state_id,
    data_jsonb: row.data_jsonb,
    row_version: row.row_version,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    disposed_at: row.disposed_at,
    disposal_type: row.disposal_type,
    sla_due_at: row.sla_due_at,
    sla_paused_at: row.sla_paused_at
  }));
}

// C11: Streaming CSV export — builds CSV without loading all rows into objects
export async function exportApplicationsToCSV(
  authorityId?: string,
  searchTerm?: string,
  status?: string
): Promise<import("stream").Readable> {
  // Build query directly (avoids intermediate Application objects)
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (authorityId) {
    conditions.push(`a.authority_id = $${idx++}`);
    params.push(authorityId);
  }
  if (status) {
    conditions.push(`a.state_id = $${idx++}`);
    params.push(status);
  }
  if (searchTerm) {
    // PERF-001: Use same expression as idx_application_search_text_trgm
    const term = `%${searchTerm}%`;
    conditions.push(`(
      COALESCE(a.public_arn, '') || ' ' ||
      a.arn || ' ' ||
      COALESCE(a.data_jsonb->'applicant'->>'full_name', '') || ' ' ||
      COALESCE(a.data_jsonb->'applicant'->>'name', '') || ' ' ||
      COALESCE(a.data_jsonb->'property'->>'upn', '') || ' ' ||
      COALESCE(a.data_jsonb->'property'->>'plot_no', '') || ' ' ||
      COALESCE(a.data_jsonb->'property'->>'scheme_name', '')
    ) ILIKE $${idx++}`);
    params.push(term);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const sql = `SELECT
    COALESCE(a.public_arn, a.arn) AS arn,
    a.service_key,
    a.authority_id,
    COALESCE(a.data_jsonb->'applicant'->>'full_name', a.data_jsonb->'applicant'->>'name', '') AS applicant_name,
    COALESCE(a.data_jsonb->'property'->>'upn', '') AS upn,
    COALESCE(a.data_jsonb->'property'->>'plot_no', '') AS plot_no,
    COALESCE(a.data_jsonb->'property'->>'scheme_name', '') AS scheme_name,
    a.state_id,
    a.created_at,
    a.submitted_at,
    a.disposed_at,
    COALESCE(a.disposal_type, '') AS disposal_type
  FROM application a ${where}
  ORDER BY a.created_at DESC
  LIMIT 10000`;

  // PERF-003: Stream CSV rows instead of building full string in memory
  const { Readable } = await import("stream");
  const headers = ["ARN","Service Key","Authority ID","Applicant Name","UPN","Plot No","Scheme Name","Status","Created At","Submitted At","Disposed At","Disposal Type"];

  function esc(v: string): string {
    const value = String(v ?? "");
    // Prevent CSV formula execution when opened in spreadsheet software.
    const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n")
      ? `"${safeValue.replace(/"/g, '""')}"`
      : safeValue;
  }

  function rowToCsv(row: any): string {
    return [
      esc(row.arn), esc(row.service_key), esc(row.authority_id),
      esc(row.applicant_name), esc(row.upn), esc(row.plot_no), esc(row.scheme_name),
      esc(row.state_id),
      row.created_at ? new Date(row.created_at).toISOString() : "",
      row.submitted_at ? new Date(row.submitted_at).toISOString() : "",
      row.disposed_at ? new Date(row.disposed_at).toISOString() : "",
      esc(row.disposal_type),
    ].join(",");
  }

  const result = await query(sql, params);

  return new Readable({
    read() {
      this.push(headers.join(",") + "\n");
      for (const row of result.rows) {
        this.push(rowToCsv(row) + "\n");
      }
      this.push(null);
    },
  });
}

const IN_PROGRESS_STATES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_AT_CLERK",
  "IN_PROGRESS",
  "QUERY_PENDING",
  "RESUBMITTED",
  "PENDING_AT_SR_ASSISTANT",
  "PENDING_AT_SR_ASSISTANT_ACCOUNTS",
  "PENDING_AT_ACCOUNT_OFFICER",
  "PENDING_AT_JUNIOR_ENGINEER",
  "PENDING_AT_SDE",
  "PENDING_AT_SDO",
  "PENDING_AT_SDO_PH",
  "PENDING_AT_DRAFTSMAN",
];

export async function checkDuplicateApplication(
  userId: string,
  serviceKey: string,
  propertyId?: string | null
): Promise<Array<{ arn: string; public_arn: string | null; state_id: string; created_at: Date }>> {
  const placeholders = IN_PROGRESS_STATES.map((_, i) => `$${i + 3}`).join(", ");
  const params: any[] = [userId, serviceKey, ...IN_PROGRESS_STATES];

  if (propertyId) {
    const sql = `
      SELECT a.arn, a.public_arn, a.state_id, a.created_at
      FROM application a
      JOIN application_property ap ON a.arn = ap.arn
      WHERE a.applicant_user_id = $1
        AND a.service_key = $2
        AND a.state_id IN (${placeholders})
        AND ap.property_id = $${params.length + 1}
      ORDER BY a.created_at DESC
    `;
    params.push(propertyId);
    const result = await query(sql, params);
    return result.rows;
  }

  const sql = `
    SELECT arn, public_arn, state_id, created_at
    FROM application
    WHERE applicant_user_id = $1
      AND service_key = $2
      AND state_id IN (${placeholders})
    ORDER BY created_at DESC
  `;
  const result = await query(sql, params);
  return result.rows;
}

export async function getUserPendingActions(userId: string): Promise<{
  queries: Array<{ arn: string; service_key: string; query_id: string; query_number: number; message: string; response_due_at: Date }>;
  documentRequests: Array<{ arn: string; service_key: string; doc_type_id: string; doc_type_name: string }>;
}> {
  // Get pending queries
  const queriesResult = await query(
    `SELECT q.arn, q.query_id, q.query_number, q.message, q.response_due_at, a.service_key
     FROM query q
     JOIN application a ON q.arn = a.arn
     WHERE a.applicant_user_id = $1 AND q.status = 'PENDING'
     ORDER BY q.response_due_at ASC`,
    [userId]
  );
  
  const queries = queriesResult.rows.map(row => ({
    arn: row.arn,
    service_key: row.service_key,
    query_id: row.query_id,
    query_number: row.query_number,
    message: row.message,
    response_due_at: row.response_due_at
  }));
  
  // For now, document requests are inferred from queries with unlocked_doc_type_ids
  // In a full implementation, this would come from a separate document_request table
  const docRequestsResult = await query(
    `SELECT DISTINCT q.arn, a.service_key, unnest(q.unlocked_doc_type_ids) as doc_type_id
     FROM query q
     JOIN application a ON q.arn = a.arn
     WHERE a.applicant_user_id = $1 AND q.status = 'PENDING' AND array_length(q.unlocked_doc_type_ids, 1) > 0`,
    [userId]
  );
  
  const documentRequests = docRequestsResult.rows.map(row => ({
    arn: row.arn,
    service_key: row.service_key,
    doc_type_id: row.doc_type_id,
    doc_type_name: row.doc_type_id // In production, join with document_type table
  }));
  
  return { queries, documentRequests };
}
