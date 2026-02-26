import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Field, Input } from "@puda/shared";
import { Bilingual } from "./Bilingual";
import "./document-upload-panel.css";

interface DocumentType {
  docTypeId: string;
  name: string;
  mandatory: boolean;
  allowedMimeTypes?: string[];
  maxSizeMB?: number;
  declarationTemplate?: any;
}

interface CitizenDocument {
  citizen_doc_id: string;
  doc_type_id: string;
  citizen_version: number;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
  linked_applications?: Array<{
    arn: string;
    verification_status: string;
  }>;
}

interface ApplicationDocument {
  doc_id: string;
  doc_type_id: string;
  verification_status?: string;
  verification_remarks?: string;
}

interface DocumentUploadPanelProps {
  mode: "full" | "preview";
  documentTypes: DocumentType[];
  citizenDocuments: CitizenDocument[];
  // Full mode only:
  applicationDocuments?: ApplicationDocument[];
  onDocumentUpload?: (docTypeId: string, file: File) => void;
  onReuseDocument?: (citizenDocId: string, docTypeId: string) => void;
  uploading?: boolean;
  uploadProgress?: number;
  isOffline?: boolean;
  unlockedDocTypeIds?: string[];
  applicationStateId?: string;
  onDeclarationStart?: (docTypeId: string) => void;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

function formatFileSize(bytes: number): string {
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DocumentUploadPanel({
  mode,
  documentTypes,
  citizenDocuments,
  applicationDocuments = [],
  onDocumentUpload,
  onReuseDocument,
  uploading = false,
  uploadProgress = 0,
  isOffline = false,
  unlockedDocTypeIds,
  applicationStateId,
  onDeclarationStart,
}: DocumentUploadPanelProps) {
  const { t } = useTranslation();

  if (documentTypes.length === 0) return null;

  // In full mode with QUERY_PENDING, filter to unlocked doc types only
  const visibleDocTypes =
    mode === "full" && applicationStateId === "QUERY_PENDING" && unlockedDocTypeIds
      ? documentTypes.filter((dt) => unlockedDocTypeIds.includes(dt.docTypeId))
      : documentTypes;

  if (visibleDocTypes.length === 0) return null;

  // ─── Preview Mode (upload to locker) ───
  if (mode === "preview") {
    return (
      <div className="doc-upload-panel doc-upload-panel--preview">
        <h3 className="doc-upload-panel__title">
          <Bilingual tKey="docs.required_documents" />
        </h3>
        {uploading && uploadProgress > 0 && (
          <div
            className="upload-progress"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          >
            <div className="upload-progress__track">
              <div
                className="upload-progress__fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="upload-progress__label">{uploadProgress}%</span>
          </div>
        )}
        <div className="doc-checklist">
          {visibleDocTypes.map((dt) => {
            const lockerDoc = citizenDocuments.find(
              (cd) => cd.doc_type_id === dt.docTypeId
            );
            return (
              <div key={dt.docTypeId} className="doc-checklist-item">
                <div className="doc-checklist-item__header">
                  <span className="doc-checklist-item__name">{dt.name}</span>
                  <span
                    className={`doc-checklist-badge ${
                      dt.mandatory
                        ? "doc-checklist-badge--mandatory"
                        : "doc-checklist-badge--optional"
                    }`}
                  >
                    {dt.mandatory ? t("docs.mandatory") : t("docs.optional")}
                  </span>
                </div>
                {lockerDoc ? (
                  <div className="doc-locker-match">
                    {lockerDoc.mime_type?.startsWith("image/") ? (
                      <img
                        src={`${apiBaseUrl}/api/v1/citizens/me/documents/${lockerDoc.citizen_doc_id}/download`}
                        alt={lockerDoc.original_filename || ""}
                        className="doc-locker-match__thumb"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="doc-locker-match__icon">PDF</div>
                    )}
                    <div className="doc-locker-match__info">
                      <div className="doc-locker-match__name">
                        {lockerDoc.original_filename || lockerDoc.doc_type_id}
                      </div>
                      <div className="doc-locker-match__meta">
                        v{lockerDoc.citizen_version}
                        {lockerDoc.size_bytes
                          ? ` · ${formatFileSize(lockerDoc.size_bytes)}`
                          : ""}
                      </div>
                      <div className="doc-locker-match__hint">
                        {t("docs.in_locker")}
                      </div>
                    </div>
                  </div>
                ) : null}
                {dt.declarationTemplate && onDeclarationStart && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={uploading || isOffline}
                    onClick={() => onDeclarationStart(dt.docTypeId)}
                    style={{ marginBottom: "var(--space-2)" }}
                  >
                    {t("docs.fill_online")}
                  </Button>
                )}
                {/* Upload to locker — always show input, even if a version exists (allows re-upload) */}
                {onDocumentUpload && (
                  <Field
                    label={
                      lockerDoc
                        ? `${dt.name} ${t("docs.or_upload_new")}`
                        : t("docs.upload_to_locker")
                    }
                    htmlFor={`preview-upload-${dt.docTypeId}`}
                  >
                    <Input
                      id={`preview-upload-${dt.docTypeId}`}
                      type="file"
                      accept={dt.allowedMimeTypes?.join(",") || ".pdf,.jpg,.png"}
                      disabled={uploading || isOffline}
                      onChange={(e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) onDocumentUpload(dt.docTypeId, f);
                      }}
                      className="upload-input"
                    />
                  </Field>
                )}
                {!onDocumentUpload && !lockerDoc && (
                  <p className="doc-checklist-item__not-in-locker">
                    {t("docs.not_in_locker")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <Alert variant="info" className="doc-upload-deferred">
          {t("docs.locker_hint")}
        </Alert>
      </div>
    );
  }

  // ─── Full Mode ───
  const allOptional =
    visibleDocTypes.every((dt) => !dt.mandatory) &&
    applicationDocuments.length === 0;

  return (
    <div className="doc-upload-panel doc-upload-panel--full">
      <h3 className="upload-title">
        <Bilingual tKey="app_detail.upload_documents" />
      </h3>
      {allOptional && (
        <Alert variant="info" className="detail-empty-alert">
          {t("app_detail.all_optional")}
        </Alert>
      )}
      {uploading && uploadProgress > 0 && (
        <div
          className="upload-progress"
          role="progressbar"
          aria-valuenow={uploadProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
        >
          <div className="upload-progress__track">
            <div
              className="upload-progress__fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="upload-progress__label">{uploadProgress}%</span>
        </div>
      )}
      {visibleDocTypes.map((dt) => {
        const existingLockerDoc = citizenDocuments.find(
          (cd) => cd.doc_type_id === dt.docTypeId
        );
        const existingAppDoc = applicationDocuments.find(
          (d) => d.doc_type_id === dt.docTypeId
        );
        const isRejectedOrQueried =
          existingAppDoc &&
          (existingAppDoc.verification_status === "REJECTED" ||
            existingAppDoc.verification_status === "QUERY");
        return (
          <div
            key={dt.docTypeId}
            className={`upload-row ${isRejectedOrQueried ? "doc-action-required" : ""}`}
          >
            {isRejectedOrQueried && (
              <Alert
                variant="error"
                className="doc-remarks-alert"
                style={{ marginBottom: "var(--space-2)" }}
              >
                {existingAppDoc.verification_status === "REJECTED"
                  ? "Rejected"
                  : "Query"}
                :{" "}
                {existingAppDoc.verification_remarks ||
                  "Officer has flagged this document."}{" "}
                {t("app_detail.doc_reupload")}
              </Alert>
            )}
            {existingLockerDoc &&
              onReuseDocument &&
              !isRejectedOrQueried && (
                <div className="reuse-card">
                  {existingLockerDoc.mime_type?.startsWith("image/") ? (
                    <img
                      src={`${apiBaseUrl}/api/v1/citizens/me/documents/${existingLockerDoc.citizen_doc_id}/download`}
                      alt={existingLockerDoc.original_filename || ""}
                      className="reuse-card-thumb"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="reuse-card-icon">PDF</div>
                  )}
                  <div className="reuse-card-info">
                    <div className="reuse-card-name">
                      {existingLockerDoc.original_filename ||
                        existingLockerDoc.doc_type_id}
                    </div>
                    <div className="reuse-card-meta">
                      v{existingLockerDoc.citizen_version}
                      {existingLockerDoc.size_bytes
                        ? ` · ${formatFileSize(existingLockerDoc.size_bytes)}`
                        : ""}
                      {existingLockerDoc.uploaded_at
                        ? ` · ${new Date(existingLockerDoc.uploaded_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                        : ""}
                    </div>
                    {existingLockerDoc.linked_applications &&
                      existingLockerDoc.linked_applications.filter(
                        (a) => a.verification_status === "VERIFIED"
                      ).length > 0 && (
                        <div className="reuse-card-social">
                          Verified in{" "}
                          {
                            existingLockerDoc.linked_applications.filter(
                              (a) => a.verification_status === "VERIFIED"
                            ).length
                          }{" "}
                          other application(s)
                        </div>
                      )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={uploading || isOffline}
                    onClick={() =>
                      onReuseDocument(
                        existingLockerDoc.citizen_doc_id,
                        dt.docTypeId
                      )
                    }
                  >
                    {t("docs.use_this")}
                  </Button>
                </div>
              )}
            {dt.declarationTemplate && onDeclarationStart && (
              <Button
                variant="secondary"
                disabled={uploading || isOffline}
                onClick={() => onDeclarationStart(dt.docTypeId)}
                style={{ marginBottom: "var(--space-2)" }}
              >
                {t("docs.fill_online")}
              </Button>
            )}
            <Field
              label={
                isRejectedOrQueried
                  ? `${dt.name} — ${t("app_detail.doc_reupload")}`
                  : existingLockerDoc
                    ? `${dt.name} ${t("docs.or_upload_new")}`
                    : dt.name
              }
              htmlFor={`upload-${dt.docTypeId}`}
            >
              <Input
                id={`upload-${dt.docTypeId}`}
                type="file"
                accept={dt.allowedMimeTypes?.join(",") || ".pdf,.jpg,.png"}
                disabled={uploading || isOffline}
                onChange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f && onDocumentUpload) onDocumentUpload(dt.docTypeId, f);
                }}
                className="upload-input"
              />
            </Field>
          </div>
        );
      })}
    </div>
  );
}
