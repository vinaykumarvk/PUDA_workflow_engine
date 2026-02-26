import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { Readable } from "stream";
import { getStorage, streamToStorageWithValidation } from "./storage";
import path from "path";

export interface Document {
  doc_id: string;
  arn: string;
  doc_type_id: string;
  version: number;
  storage_key?: string;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  checksum?: string;
  uploaded_at: Date;
  is_current: boolean;
  verification_status?: string;
  verification_remarks?: string;
  verified_by_user_id?: string;
  verified_at?: Date;
}

function sanitizeStorageSegment(value: string, fallback: string): string {
  const base = path.basename(value || "").trim();
  const normalized = base.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") {
    return fallback;
  }
  return normalized;
}

export async function uploadDocument(
  arn: string,
  docTypeId: string,
  filename: string,
  mimeType: string,
  fileBufferOrStream: Buffer | Readable,
  userId: string
): Promise<Document> {
  // Step 1: Store file in citizen locker (single write, single storage path)
  const citizenDoc = await uploadCitizenDocument(userId, docTypeId, filename, mimeType, fileBufferOrStream);

  // Step 2: Create junction reference linking locker doc to this application
  const { app_doc_id: appDocId } = await reuseDocumentForApplication(userId, citizenDoc.citizen_doc_id, arn, docTypeId);

  // Step 3: Audit event
  await query(
    "INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      uuidv4(),
      arn,
      "DOCUMENT_UPLOADED",
      "CITIZEN",
      userId,
      JSON.stringify({
        docId: appDocId,
        citizenDocId: citizenDoc.citizen_doc_id,
        docTypeId,
        version: citizenDoc.citizen_version,
        filename,
        checksum: citizenDoc.checksum,
      })
    ]
  );

  // Step 4: Return Document-shaped object (doc_id = app_doc_id for API compat)
  return {
    doc_id: appDocId,
    arn,
    doc_type_id: docTypeId,
    version: citizenDoc.citizen_version,
    storage_key: citizenDoc.storage_key,
    original_filename: citizenDoc.original_filename,
    mime_type: citizenDoc.mime_type,
    size_bytes: citizenDoc.size_bytes,
    checksum: citizenDoc.checksum,
    uploaded_at: citizenDoc.uploaded_at,
    is_current: true,
    verification_status: "PENDING",
  };
}

export async function getDocument(docId: string): Promise<Document | null> {
  // V2-first: check application_document + citizen_document (locker is source of truth)
  const v2Result = await query(
    `SELECT ad.app_doc_id AS doc_id, ad.arn, ad.doc_type_id,
            cd.citizen_version AS version, cd.storage_key, cd.original_filename,
            cd.mime_type, cd.size_bytes, cd.checksum, cd.uploaded_at,
            ad.is_current, ad.verification_status
     FROM application_document ad
     JOIN citizen_document cd ON cd.citizen_doc_id = ad.citizen_doc_id
     WHERE ad.app_doc_id = $1`,
    [docId]
  );
  if (v2Result.rows.length > 0) {
    const row = v2Result.rows[0];
    return {
      doc_id: row.doc_id,
      arn: row.arn,
      doc_type_id: row.doc_type_id,
      version: row.version,
      storage_key: row.storage_key,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      checksum: row.checksum,
      uploaded_at: row.uploaded_at,
      is_current: row.is_current,
      verification_status: row.verification_status,
    };
  }

  // Fallback: old document table for historical data
  const result = await query(
    "SELECT doc_id, arn, doc_type_id, version, storage_key, original_filename, mime_type, size_bytes, checksum, uploaded_at, is_current, verification_status FROM document WHERE doc_id = $1",
    [docId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    doc_id: row.doc_id,
    arn: row.arn,
    doc_type_id: row.doc_type_id,
    version: row.version,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum: row.checksum,
    uploaded_at: row.uploaded_at,
    is_current: row.is_current,
    verification_status: row.verification_status
  };
}

export async function getApplicationDocuments(arn: string): Promise<Document[]> {
  // Try V2 (application_document + citizen_document) first
  const v2Docs = await getApplicationDocumentsV2(arn);
  if (v2Docs.length > 0) return v2Docs;

  // Fallback to old table
  const result = await query(
    "SELECT doc_id, arn, doc_type_id, version, storage_key, original_filename, mime_type, size_bytes, checksum, uploaded_at, is_current, verification_status FROM document WHERE arn = $1 AND is_current = TRUE ORDER BY doc_type_id, version DESC",
    [arn]
  );

  return result.rows.map(row => ({
    doc_id: row.doc_id,
    arn: row.arn,
    doc_type_id: row.doc_type_id,
    version: row.version,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum: row.checksum,
    uploaded_at: row.uploaded_at,
    is_current: row.is_current,
    verification_status: row.verification_status
  }));
}

export async function getDocumentFile(docId: string): Promise<Buffer | null> {
  const doc = await getDocument(docId);
  if (!doc || !doc.storage_key) return null;
  // C9: Read file via pluggable storage adapter
  return getStorage().read(doc.storage_key);
}

// --- Citizen Document Locker functions ---

export interface CitizenDocument {
  citizen_doc_id: string;
  user_id: string;
  doc_type_id: string;
  citizen_version: number;
  storage_key: string;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  checksum?: string;
  uploaded_at: Date;
  is_current: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  status: string;
  computed_status: string;
  origin: string;
  source_arn?: string | null;
  linked_applications?: Array<{
    arn: string;
    app_doc_id: string;
    verification_status: string;
    verification_remarks?: string;
  }>;
}

export async function uploadCitizenDocument(
  userId: string,
  docTypeId: string,
  filename: string,
  mimeType: string,
  fileBufferOrStream: Buffer | Readable,
  options?: { validFrom?: string; validUntil?: string }
): Promise<CitizenDocument> {
  const existingResult = await query(
    "SELECT citizen_version FROM citizen_document WHERE user_id = $1 AND doc_type_id = $2 ORDER BY citizen_version DESC LIMIT 1",
    [userId, docTypeId]
  );
  const citizenVersion = existingResult.rows.length > 0 ? existingResult.rows[0].citizen_version + 1 : 1;

  const safeUserId = sanitizeStorageSegment(userId, "user");
  const safeDocTypeId = sanitizeStorageSegment(docTypeId, "doc");
  const safeFilename = sanitizeStorageSegment(filename, "file");
  const storageKey = `citizen/${safeUserId}/${safeDocTypeId}/v${citizenVersion}/${safeFilename}`;

  let sizeBytes: number;
  let checksum: string;

  if (Buffer.isBuffer(fileBufferOrStream)) {
    checksum = crypto.createHash("sha256").update(fileBufferOrStream).digest("hex");
    sizeBytes = fileBufferOrStream.length;
    await getStorage().write(storageKey, fileBufferOrStream);
  } else {
    const result = await streamToStorageWithValidation(fileBufferOrStream, storageKey, mimeType);
    sizeBytes = result.bytesWritten;
    checksum = result.checksum;
  }

  // Mark previous versions as not current
  await query(
    "UPDATE citizen_document SET is_current = FALSE WHERE user_id = $1 AND doc_type_id = $2",
    [userId, docTypeId]
  );

  const citizenDocId = uuidv4();
  const validFrom = options?.validFrom || null;
  const validUntil = options?.validUntil || null;
  await query(
    "INSERT INTO citizen_document (citizen_doc_id, user_id, doc_type_id, citizen_version, storage_key, original_filename, mime_type, size_bytes, checksum, is_current, valid_from, valid_until) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11)",
    [citizenDocId, userId, docTypeId, citizenVersion, storageKey, filename, mimeType, sizeBytes, checksum, validFrom, validUntil]
  );

  return {
    citizen_doc_id: citizenDocId,
    user_id: userId,
    doc_type_id: docTypeId,
    citizen_version: citizenVersion,
    storage_key: storageKey,
    original_filename: filename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    checksum,
    uploaded_at: new Date(),
    is_current: true,
    valid_from: validFrom,
    valid_until: validUntil,
    status: "VALID",
    computed_status: "VALID",
    origin: "uploaded",
    source_arn: null,
  };
}

export async function getCitizenDocuments(userId: string): Promise<CitizenDocument[]> {
  const result = await query(
    `SELECT cd.citizen_doc_id, cd.user_id, cd.doc_type_id, cd.citizen_version,
            cd.storage_key, cd.original_filename, cd.mime_type, cd.size_bytes,
            cd.checksum, cd.uploaded_at, cd.is_current,
            cd.valid_from, cd.valid_until,
            cd.status, cd.origin, cd.source_arn,
            CASE
              WHEN cd.status = 'CANCELLED' THEN 'CANCELLED'
              WHEN cd.status = 'MISMATCH' THEN 'MISMATCH'
              WHEN cd.valid_until IS NOT NULL AND cd.valid_until < CURRENT_DATE THEN 'EXPIRED'
              ELSE 'VALID'
            END AS computed_status,
            COALESCE(json_agg(json_build_object(
              'arn', ad.arn,
              'app_doc_id', ad.app_doc_id,
              'verification_status', ad.verification_status,
              'verification_remarks', ad.verification_remarks
            )) FILTER (WHERE ad.arn IS NOT NULL), '[]') AS linked_applications
     FROM citizen_document cd
     LEFT JOIN application_document ad ON ad.citizen_doc_id = cd.citizen_doc_id AND ad.is_current = TRUE
     WHERE cd.user_id = $1 AND cd.is_current = TRUE
     GROUP BY cd.citizen_doc_id
     ORDER BY cd.uploaded_at DESC`,
    [userId]
  );

  return result.rows.map((row: any) => ({
    citizen_doc_id: row.citizen_doc_id,
    user_id: row.user_id,
    doc_type_id: row.doc_type_id,
    citizen_version: row.citizen_version,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum: row.checksum,
    uploaded_at: row.uploaded_at,
    is_current: row.is_current,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    status: row.status || "VALID",
    computed_status: row.computed_status || "VALID",
    origin: row.origin || "uploaded",
    source_arn: row.source_arn,
    linked_applications: row.linked_applications,
  }));
}

export async function getCitizenDocVersions(
  userId: string,
  docTypeId: string,
  limit = 20
): Promise<CitizenDocument[]> {
  const result = await query(
    `SELECT citizen_doc_id, user_id, doc_type_id, citizen_version,
            storage_key, original_filename, mime_type, size_bytes,
            checksum, uploaded_at, is_current,
            valid_from, valid_until, status, origin, source_arn,
            CASE
              WHEN status = 'CANCELLED' THEN 'CANCELLED'
              WHEN status = 'MISMATCH' THEN 'MISMATCH'
              WHEN valid_until IS NOT NULL AND valid_until < CURRENT_DATE THEN 'EXPIRED'
              ELSE 'VALID'
            END AS computed_status
     FROM citizen_document
     WHERE user_id = $1 AND doc_type_id = $2
     ORDER BY citizen_version DESC
     LIMIT $3`,
    [userId, docTypeId, limit]
  );
  return result.rows.map((row: any) => ({
    citizen_doc_id: row.citizen_doc_id,
    user_id: row.user_id,
    doc_type_id: row.doc_type_id,
    citizen_version: row.citizen_version,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum: row.checksum,
    uploaded_at: row.uploaded_at,
    is_current: row.is_current,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    status: row.status || "VALID",
    computed_status: row.computed_status || "VALID",
    origin: row.origin || "uploaded",
    source_arn: row.source_arn,
  }));
}

export async function reuseDocumentForApplication(
  userId: string,
  citizenDocId: string,
  arn: string,
  docTypeId: string
): Promise<{ app_doc_id: string }> {
  // Validate ownership
  const docResult = await query(
    "SELECT citizen_doc_id, user_id, doc_type_id FROM citizen_document WHERE citizen_doc_id = $1",
    [citizenDocId]
  );
  if (docResult.rows.length === 0) throw new Error("CITIZEN_DOC_NOT_FOUND");
  if (docResult.rows[0].user_id !== userId) throw new Error("FORBIDDEN");

  // Check for existing link
  const existingLink = await query(
    "SELECT app_doc_id FROM application_document WHERE arn = $1 AND citizen_doc_id = $2",
    [arn, citizenDocId]
  );
  if (existingLink.rows.length > 0) {
    return { app_doc_id: existingLink.rows[0].app_doc_id };
  }

  // Mark previous app docs for this arn+doc_type as not current
  await query(
    "UPDATE application_document SET is_current = FALSE WHERE arn = $1 AND doc_type_id = $2",
    [arn, docTypeId]
  );

  const appDocId = uuidv4();
  await query(
    `INSERT INTO application_document (app_doc_id, arn, citizen_doc_id, doc_type_id, attached_by_user_id, is_current)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [appDocId, arn, citizenDocId, docTypeId, userId]
  );

  return { app_doc_id: appDocId };
}

export async function getApplicationDocumentsV2(arn: string): Promise<Document[]> {
  const result = await query(
    `SELECT ad.app_doc_id, ad.arn, ad.doc_type_id,
            cd.citizen_version AS version,
            cd.storage_key, cd.original_filename, cd.mime_type,
            cd.size_bytes, cd.checksum, cd.uploaded_at,
            ad.is_current,
            ad.verification_status,
            ad.verification_remarks,
            ad.verified_by_user_id,
            ad.verified_at
     FROM application_document ad
     JOIN citizen_document cd ON cd.citizen_doc_id = ad.citizen_doc_id
     WHERE ad.arn = $1 AND ad.is_current = TRUE
     ORDER BY ad.doc_type_id, cd.citizen_version DESC`,
    [arn]
  );

  return result.rows.map((row: any) => ({
    doc_id: row.app_doc_id,
    arn: row.arn,
    doc_type_id: row.doc_type_id,
    version: row.version,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum: row.checksum,
    uploaded_at: row.uploaded_at,
    is_current: row.is_current,
    verification_status: row.verification_status,
    verification_remarks: row.verification_remarks,
    verified_by_user_id: row.verified_by_user_id,
    verified_at: row.verified_at,
  }));
}

export async function updateDocumentVerification(
  appDocId: string,
  status: string,
  verifiedByUserId: string,
  remarks?: string
): Promise<void> {
  await query(
    `UPDATE application_document
     SET verification_status = $1, verified_by_user_id = $2, verified_at = NOW(), verification_remarks = $3
     WHERE app_doc_id = $4`,
    [status, verifiedByUserId, remarks || null, appDocId]
  );
}

export async function batchUpdateDocumentVerifications(
  updates: Array<{ appDocId: string; status: string; remarks?: string }>,
  verifiedByUserId: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    for (const update of updates) {
      await client.query(
        `UPDATE application_document
         SET verification_status = $1, verified_by_user_id = $2, verified_at = NOW(), verification_remarks = $3
         WHERE app_doc_id = $4`,
        [update.status, verifiedByUserId, update.remarks || null, update.appDocId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function resetVerificationOnReupload(
  arn: string,
  docTypeId: string,
  newCitizenDocId: string
): Promise<void> {
  // Update application_document to point to new citizen_doc_id and reset verification
  await query(
    `UPDATE application_document
     SET citizen_doc_id = $1, verification_status = 'PENDING', verification_remarks = NULL,
         verified_by_user_id = NULL, verified_at = NULL
     WHERE arn = $2 AND doc_type_id = $3 AND is_current = TRUE`,
    [newCitizenDocId, arn, docTypeId]
  );
}

export async function getApplicationDocumentById(appDocId: string): Promise<any | null> {
  const result = await query(
    `SELECT ad.*, cd.original_filename, cd.mime_type, cd.size_bytes, cd.storage_key, cd.citizen_version
     FROM application_document ad
     JOIN citizen_document cd ON cd.citizen_doc_id = ad.citizen_doc_id
     WHERE ad.app_doc_id = $1`,
    [appDocId]
  );
  return result.rows[0] || null;
}

export async function getApplicationDocumentsByIds(appDocIds: string[]): Promise<any[]> {
  if (appDocIds.length === 0) return [];
  const placeholders = appDocIds.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query(
    `SELECT ad.*, cd.original_filename, cd.mime_type, cd.size_bytes, cd.storage_key, cd.citizen_version
     FROM application_document ad
     JOIN citizen_document cd ON cd.citizen_doc_id = ad.citizen_doc_id
     WHERE ad.app_doc_id IN (${placeholders})`,
    appDocIds
  );
  return result.rows;
}

export async function getCitizenDocument(citizenDocId: string): Promise<CitizenDocument | null> {
  const result = await query(
    `SELECT citizen_doc_id, user_id, doc_type_id, citizen_version,
            storage_key, original_filename, mime_type, size_bytes,
            checksum, uploaded_at, is_current,
            valid_from, valid_until, status, origin, source_arn,
            CASE
              WHEN status = 'CANCELLED' THEN 'CANCELLED'
              WHEN status = 'MISMATCH' THEN 'MISMATCH'
              WHEN valid_until IS NOT NULL AND valid_until < CURRENT_DATE THEN 'EXPIRED'
              ELSE 'VALID'
            END AS computed_status
     FROM citizen_document WHERE citizen_doc_id = $1`,
    [citizenDocId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    citizen_doc_id: row.citizen_doc_id,
    user_id: row.user_id,
    doc_type_id: row.doc_type_id,
    citizen_version: row.citizen_version,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    checksum: row.checksum,
    uploaded_at: row.uploaded_at,
    is_current: row.is_current,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    status: row.status || "VALID",
    computed_status: row.computed_status || "VALID",
    origin: row.origin || "uploaded",
    source_arn: row.source_arn,
  };
}

export async function getCitizenDocumentFile(citizenDocId: string): Promise<Buffer | null> {
  const doc = await getCitizenDocument(citizenDocId);
  if (!doc || !doc.storage_key) return null;
  return getStorage().read(doc.storage_key);
}

export async function issueCitizenDocument(
  userId: string,
  docTypeId: string,
  storageKey: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  sourceArn: string,
  validFrom?: string | null,
  validUntil?: string | null
): Promise<CitizenDocument> {
  const existingResult = await query(
    "SELECT citizen_version FROM citizen_document WHERE user_id = $1 AND doc_type_id = $2 ORDER BY citizen_version DESC LIMIT 1",
    [userId, docTypeId]
  );
  const citizenVersion = existingResult.rows.length > 0 ? existingResult.rows[0].citizen_version + 1 : 1;

  // Mark previous versions as not current
  await query(
    "UPDATE citizen_document SET is_current = FALSE WHERE user_id = $1 AND doc_type_id = $2",
    [userId, docTypeId]
  );

  const citizenDocId = uuidv4();
  await query(
    `INSERT INTO citizen_document (citizen_doc_id, user_id, doc_type_id, citizen_version, storage_key, original_filename, mime_type, size_bytes, is_current, valid_from, valid_until, status, origin, source_arn)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, 'VALID', 'issued', $11)`,
    [citizenDocId, userId, docTypeId, citizenVersion, storageKey, filename, mimeType, sizeBytes, validFrom || null, validUntil || null, sourceArn]
  );

  return {
    citizen_doc_id: citizenDocId,
    user_id: userId,
    doc_type_id: docTypeId,
    citizen_version: citizenVersion,
    storage_key: storageKey,
    original_filename: filename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    uploaded_at: new Date(),
    is_current: true,
    valid_from: validFrom || null,
    valid_until: validUntil || null,
    status: "VALID",
    computed_status: "VALID",
    origin: "issued",
    source_arn: sourceArn,
  };
}

const VALID_CITIZEN_DOC_STATUSES = ["VALID", "MISMATCH", "CANCELLED"];

export async function updateCitizenDocumentStatus(
  citizenDocId: string,
  status: string,
  userId: string
): Promise<void> {
  if (!VALID_CITIZEN_DOC_STATUSES.includes(status)) {
    throw new Error("INVALID_STATUS");
  }
  const result = await query(
    "UPDATE citizen_document SET status = $1 WHERE citizen_doc_id = $2 AND user_id = $3",
    [status, citizenDocId, userId]
  );
  if (result.rowCount === 0) {
    throw new Error("CITIZEN_DOC_NOT_FOUND");
  }
}
