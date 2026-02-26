import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import { getStorage, streamToStorageWithValidation } from "./storage";
import { UploadErrorCode } from "./upload-errors";
import path from "path";

export interface Complaint {
  complaint_id: string;
  complaint_number: string;
  user_id: string;
  violation_type: string;
  location_address: string;
  location_locality?: string;
  location_city: string;
  location_district: string;
  location_pincode?: string;
  subject: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  officer_remarks?: string;
  evidence_count?: number;
}

export interface ComplaintEvidence {
  evidence_id: string;
  complaint_id: string;
  storage_key: string;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at: string;
  uploaded_by: string;
}

const VIOLATION_TYPES = [
  "UNAUTHORIZED_CONSTRUCTION",
  "PLAN_DEVIATION",
  "ENCROACHMENT",
  "HEIGHT_VIOLATION",
  "SETBACK_VIOLATION",
  "CHANGE_OF_USE",
  "UNAUTHORIZED_COLONY",
  "OTHER",
] as const;

const MAX_EVIDENCE_PER_COMPLAINT = 5;
const MAX_EVIDENCE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png"];

function sanitizeStorageSegment(value: string, fallback: string): string {
  const base = path.basename(value || "").trim();
  const normalized = base.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") {
    return fallback;
  }
  return normalized;
}

export async function createComplaint(
  userId: string,
  data: {
    violationType: string;
    locationAddress: string;
    locationLocality?: string;
    locationCity?: string;
    locationDistrict?: string;
    locationPincode?: string;
    subject: string;
    description: string;
  }
): Promise<Complaint> {
  if (!VIOLATION_TYPES.includes(data.violationType as any)) {
    throw new Error("INVALID_VIOLATION_TYPE");
  }

  const complaintId = uuidv4();
  const year = new Date().getFullYear();

  // Get next sequence number
  const seqResult = await query("SELECT nextval('complaint_number_seq') AS seq");
  const seq = String(seqResult.rows[0].seq).padStart(6, "0");
  const complaintNumber = `PUDA/CMP/${year}/${seq}`;

  await query(
    `INSERT INTO complaint (
      complaint_id, complaint_number, user_id, violation_type,
      location_address, location_locality, location_city, location_district, location_pincode,
      subject, description
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      complaintId,
      complaintNumber,
      userId,
      data.violationType,
      data.locationAddress,
      data.locationLocality || null,
      data.locationCity || "Mohali",
      data.locationDistrict || "SAS Nagar",
      data.locationPincode || null,
      data.subject,
      data.description,
    ]
  );

  const complaint = await getComplaint(complaintId);
  if (!complaint) throw new Error("COMPLAINT_NOT_FOUND");
  return complaint;
}

export async function getComplaintsByUser(
  userId: string,
  opts?: { status?: string; limit?: number; offset?: number }
): Promise<{ complaints: Complaint[]; total: number }> {
  const limit = Math.min(opts?.limit || 50, 100);
  const offset = opts?.offset || 0;
  const conditions = ["c.user_id = $1"];
  const params: any[] = [userId];
  let paramIdx = 2;

  if (opts?.status) {
    conditions.push(`c.status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM complaint c WHERE ${where}`,
    params
  );

  const result = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM complaint_evidence ce WHERE ce.complaint_id = c.complaint_id) AS evidence_count
     FROM complaint c
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return {
    complaints: result.rows.map(mapComplaintRow),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

export async function getComplaint(complaintId: string): Promise<Complaint | null> {
  const result = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM complaint_evidence ce WHERE ce.complaint_id = c.complaint_id) AS evidence_count
     FROM complaint c WHERE c.complaint_id = $1`,
    [complaintId]
  );
  if (result.rows.length === 0) return null;
  return mapComplaintRow(result.rows[0]);
}

export async function getComplaintByNumber(complaintNumber: string): Promise<Complaint | null> {
  const result = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM complaint_evidence ce WHERE ce.complaint_id = c.complaint_id) AS evidence_count
     FROM complaint c WHERE c.complaint_number = $1`,
    [complaintNumber]
  );
  if (result.rows.length === 0) return null;
  return mapComplaintRow(result.rows[0]);
}

export async function getComplaintEvidence(complaintId: string): Promise<ComplaintEvidence[]> {
  const result = await query(
    `SELECT * FROM complaint_evidence WHERE complaint_id = $1 ORDER BY uploaded_at`,
    [complaintId]
  );
  return result.rows.map((row: any) => ({
    evidence_id: row.evidence_id,
    complaint_id: row.complaint_id,
    storage_key: row.storage_key,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by,
  }));
}

export async function addComplaintEvidence(
  complaintId: string,
  userId: string,
  filename: string,
  mimeType: string,
  bufferOrStream: Buffer | Readable
): Promise<ComplaintEvidence> {
  if (!ALLOWED_EVIDENCE_TYPES.includes(mimeType)) {
    throw new Error(UploadErrorCode.INVALID_FILE_TYPE);
  }

  const evidenceId = uuidv4();
  const safeComplaintId = sanitizeStorageSegment(complaintId, "complaint");
  const safeEvidenceId = sanitizeStorageSegment(evidenceId, "evidence");
  const safeFilename = sanitizeStorageSegment(filename, "file");
  const storageKey = `complaints/${safeComplaintId}/${safeEvidenceId}/${safeFilename}`;

  // Use a single DB client transaction so the FOR UPDATE lock, count check,
  // and INSERT are atomic — prevents concurrent uploads exceeding the cap.
  let sizeBytes: number = 0;
  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Lock the complaint row to serialize concurrent evidence uploads
    await client.query(
      "SELECT complaint_id FROM complaint WHERE complaint_id = $1 FOR UPDATE",
      [complaintId]
    );

    const countResult = await client.query(
      "SELECT COUNT(*) AS cnt FROM complaint_evidence WHERE complaint_id = $1",
      [complaintId]
    );
    if (parseInt(countResult.rows[0].cnt, 10) >= MAX_EVIDENCE_PER_COMPLAINT) {
      await client.query("ROLLBACK");
      throw new Error(UploadErrorCode.MAX_EVIDENCE_REACHED);
    }

    // Write to storage (outside transaction scope — file storage is not transactional)
    if (Buffer.isBuffer(bufferOrStream)) {
      if (bufferOrStream.length > MAX_EVIDENCE_SIZE_BYTES) {
        await client.query("ROLLBACK");
        throw new Error(UploadErrorCode.FILE_TOO_LARGE);
      }
      sizeBytes = bufferOrStream.length;
      await getStorage().write(storageKey, bufferOrStream);
    } else {
      const result = await streamToStorageWithValidation(bufferOrStream, storageKey, mimeType, MAX_EVIDENCE_SIZE_BYTES);
      sizeBytes = result.bytesWritten;
    }

    await client.query(
      `INSERT INTO complaint_evidence (evidence_id, complaint_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [evidenceId, complaintId, storageKey, filename, mimeType, sizeBytes, userId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Clean up orphaned storage object if write succeeded but DB insert failed
    await getStorage().delete(storageKey).catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    evidence_id: evidenceId,
    complaint_id: complaintId,
    storage_key: storageKey,
    original_filename: filename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
  };
}

export async function getEvidenceFile(complaintId: string, evidenceId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const result = await query(
    "SELECT storage_key, mime_type, original_filename FROM complaint_evidence WHERE complaint_id = $1 AND evidence_id = $2",
    [complaintId, evidenceId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const buffer = await getStorage().read(row.storage_key);
  if (!buffer) return null;
  return {
    buffer,
    mimeType: row.mime_type || "application/octet-stream",
    filename: row.original_filename || "evidence",
  };
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["INSPECTION_ORDERED", "ACTION_TAKEN", "REJECTED"],
  INSPECTION_ORDERED: ["ACTION_TAKEN", "RESOLVED", "REJECTED"],
  ACTION_TAKEN: ["RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
};

export async function updateComplaintStatus(
  complaintId: string,
  newStatus: string,
  officerRemarks?: string
): Promise<Complaint> {
  const complaint = await getComplaint(complaintId);
  if (!complaint) throw new Error("COMPLAINT_NOT_FOUND");

  const allowed = VALID_STATUS_TRANSITIONS[complaint.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  const resolvedAt =
    newStatus === "RESOLVED" || newStatus === "CLOSED" ? new Date().toISOString() : complaint.resolved_at || null;

  await query(
    `UPDATE complaint
     SET status = $1, officer_remarks = COALESCE($2, officer_remarks), resolved_at = $3, updated_at = NOW()
     WHERE complaint_id = $4`,
    [newStatus, officerRemarks || null, resolvedAt, complaintId]
  );

  const updated = await getComplaint(complaintId);
  if (!updated) throw new Error("COMPLAINT_NOT_FOUND");
  return updated;
}

export async function getAllComplaints(
  opts?: { status?: string; violationType?: string; limit?: number; offset?: number }
): Promise<{ complaints: Complaint[]; total: number }> {
  const limit = Math.min(opts?.limit || 50, 100);
  const offset = opts?.offset || 0;
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (opts?.status) {
    conditions.push(`c.status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }

  if (opts?.violationType) {
    conditions.push(`c.violation_type = $${paramIdx}`);
    params.push(opts.violationType);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM complaint c ${where}`,
    params
  );

  const result = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM complaint_evidence ce WHERE ce.complaint_id = c.complaint_id) AS evidence_count
     FROM complaint c
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return {
    complaints: result.rows.map(mapComplaintRow),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

function mapComplaintRow(row: any): Complaint {
  return {
    complaint_id: row.complaint_id,
    complaint_number: row.complaint_number,
    user_id: row.user_id,
    violation_type: row.violation_type,
    location_address: row.location_address,
    location_locality: row.location_locality,
    location_city: row.location_city,
    location_district: row.location_district,
    location_pincode: row.location_pincode,
    subject: row.subject,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    officer_remarks: row.officer_remarks,
    evidence_count: row.evidence_count != null ? parseInt(row.evidence_count, 10) : undefined,
  };
}
