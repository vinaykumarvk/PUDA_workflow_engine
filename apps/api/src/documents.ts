import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getStorage } from "./storage";
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
}

function sanitizeStorageSegment(value: string, fallback: string): string {
  const base = path.basename(value || "").trim();
  const normalized = base.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") {
    return fallback;
  }
  return normalized;
}

function sanitizeArnForStorage(arn: string): string {
  const segments = arn.split("/").filter(Boolean);
  return segments
    .map((segment, index) => sanitizeStorageSegment(segment, `seg_${index}`))
    .join("/");
}

export async function uploadDocument(
  arn: string,
  docTypeId: string,
  filename: string,
  mimeType: string,
  fileBuffer: Buffer,
  userId: string
): Promise<Document> {
  // Get existing documents for this type
  const existingResult = await query(
    "SELECT version FROM document WHERE arn = $1 AND doc_type_id = $2 ORDER BY version DESC LIMIT 1",
    [arn, docTypeId]
  );
  
  const version = existingResult.rows.length > 0 ? existingResult.rows[0].version + 1 : 1;
  
  // Calculate checksum
  const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const safeArn = sanitizeArnForStorage(arn);
  const safeDocTypeId = sanitizeStorageSegment(docTypeId, "doc");
  const safeFilename = sanitizeStorageSegment(filename, "file");
  
  // C9: Store file via pluggable storage adapter
  const storageKey = `${safeArn}/${safeDocTypeId}/v${version}/${safeFilename}`;
  await getStorage().write(storageKey, fileBuffer);
  
  // Mark previous versions as not current
  await query(
    "UPDATE document SET is_current = FALSE WHERE arn = $1 AND doc_type_id = $2",
    [arn, docTypeId]
  );
  
  // Create document record
  const docId = uuidv4();
  await query(
    "INSERT INTO document (doc_id, arn, doc_type_id, version, storage_key, original_filename, mime_type, size_bytes, checksum, uploaded_by_user_id, is_current) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)",
    [docId, arn, docTypeId, version, storageKey, filename, mimeType, fileBuffer.length, checksum, userId]
  );
  
  // Create audit event
  await query(
    "INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      uuidv4(),
      arn,
      "DOCUMENT_UPLOADED",
      "CITIZEN",
      userId,
      JSON.stringify({ docId, docTypeId, version, filename, checksum })
    ]
  );
  
  const doc = await getDocument(docId);
  if (!doc) throw new Error("Document not found");
  return doc;
}

export async function getDocument(docId: string): Promise<Document | null> {
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
