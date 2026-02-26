/**
 * Standardized error codes for file upload operations.
 * Used across all upload routes (documents, complaints, citizen-documents).
 *
 * Route handlers should catch errors with these messages and map to HTTP 400
 * with the error code and a human-readable description.
 */
export const UploadErrorCode = {
  /** Multipart form is missing the file field entirely. */
  NO_FILE: "NO_FILE",
  /** Uploaded file has zero bytes. */
  EMPTY_FILE: "EMPTY_FILE",
  /** Declared MIME type is not in the route's allow-list (e.g. only PDF/JPEG/PNG). */
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  /** File extension does not match allowed extensions. */
  INVALID_FILE_EXTENSION: "INVALID_FILE_EXTENSION",
  /** Magic bytes in the file header do not match the declared MIME type. */
  MIME_MISMATCH: "MIME_MISMATCH",
  /** File exceeds the maximum allowed size. */
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  /** Business rule: complaint has reached its maximum evidence count (5). */
  MAX_EVIDENCE_REACHED: "MAX_EVIDENCE_REACHED",
  /** Storage key resolves outside the allowed base directory or contains symlinks. */
  INVALID_STORAGE_KEY: "INVALID_STORAGE_KEY",
} as const;

export type UploadErrorCodeValue = (typeof UploadErrorCode)[keyof typeof UploadErrorCode];

/** Human-readable descriptions for each upload error code. */
export const UPLOAD_ERROR_DESCRIPTIONS: Record<UploadErrorCodeValue, string> = {
  NO_FILE: "No file was included in the upload request.",
  EMPTY_FILE: "The uploaded file is empty (zero bytes).",
  INVALID_FILE_TYPE: "Only PDF, JPEG, and PNG files are allowed.",
  INVALID_FILE_EXTENSION: "The file extension is not allowed.",
  MIME_MISMATCH: "The file content does not match its declared type.",
  FILE_TOO_LARGE: "The file exceeds the maximum allowed size.",
  MAX_EVIDENCE_REACHED: "Maximum number of evidence files has been reached for this complaint.",
  INVALID_STORAGE_KEY: "Invalid file path.",
};

/** Check if an error message matches a known upload error code. */
export function isUploadError(message: string): message is UploadErrorCodeValue {
  return message in UPLOAD_ERROR_DESCRIPTIONS;
}
