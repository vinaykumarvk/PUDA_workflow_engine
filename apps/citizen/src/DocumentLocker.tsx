import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Bilingual } from "./Bilingual";
import { Alert, Button, Card, Field, Input, Modal, DropZone, UploadConfirm, SkeletonBlock } from "@puda/shared";
import "./document-locker.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

interface CitizenDoc {
  citizen_doc_id: string;
  user_id: string;
  doc_type_id: string;
  citizen_version: number;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at: string;
  is_current: boolean;
  valid_from?: string;
  valid_until?: string;
  status: string;
  computed_status: string;
  origin: string;
  source_arn?: string;
  linked_applications?: Array<{
    arn: string;
    app_doc_id: string;
    verification_status: string;
    verification_remarks?: string;
  }>;
}

interface VersionEntry {
  citizen_doc_id: string;
  citizen_version: number;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at: string;
  is_current: boolean;
}

interface DocumentLockerProps {
  onBack: () => void;
  isOffline: boolean;
  initialFilter?: string;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function humanizeDocType(docTypeId: string): string {
  return docTypeId
    .replace(/^DOC_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "VALID": return "locker-badge locker-badge--valid";
    case "EXPIRED": return "locker-badge locker-badge--expired";
    case "MISMATCH": return "locker-badge locker-badge--mismatch";
    case "CANCELLED": return "locker-badge locker-badge--cancelled";
    default: return "locker-badge locker-badge--valid";
  }
}

function getStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "VALID": return t("locker.status_valid");
    case "EXPIRED": return t("locker.status_expired");
    case "MISMATCH": return t("locker.status_mismatch");
    case "CANCELLED": return t("locker.status_cancelled");
    default: return status;
  }
}

function isDownloadable(doc: CitizenDoc): boolean {
  return doc.computed_status !== "CANCELLED" && doc.computed_status !== "EXPIRED";
}

/** Calculate days until expiry; null if no expiry date */
function daysUntilExpiry(validUntil: string | undefined | null): number | null {
  if (!validUntil) return null;
  const now = new Date();
  const expiry = new Date(validUntil);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryClass(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "locker-expiry--danger";
  if (days <= 30) return "locker-expiry--danger";
  if (days <= 90) return "locker-expiry--warning";
  return "locker-expiry--safe";
}

function getExpiryLabel(days: number | null, validUntil: string): string {
  if (days === null) return "";
  if (days <= 0) return `Expired (${formatDate(validUntil)})`;
  if (days <= 30) return `Expires in ${days}d (${formatDate(validUntil)})`;
  if (days <= 90) return `Expires in ${days}d`;
  return `Valid until ${formatDate(validUntil)}`;
}

type SortOption = "newest" | "oldest" | "az";
type FilterOption = "all" | "valid" | "expired" | "mismatch" | "cancelled";

export default function DocumentLocker({ onBack, isOffline, initialFilter }: DocumentLockerProps) {
  const { t } = useTranslation();
  const { authHeaders, token } = useAuth();
  const [documents, setDocuments] = useState<CitizenDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filter, sort
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterOption>(
    (initialFilter === "expired" || initialFilter === "valid" || initialFilter === "mismatch" || initialFilter === "cancelled")
      ? initialFilter as FilterOption : "all"
  );
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Version history
  const [expandedDocType, setExpandedDocType] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Upload
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadValidFrom, setUploadValidFrom] = useState("");
  const [uploadValidUntil, setUploadValidUntil] = useState("");

  // Preview
  const [previewDoc, setPreviewDoc] = useState<CitizenDoc | VersionEntry | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Lock body scroll when fullscreen preview is open
  useEffect(() => {
    if (!fullscreen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [fullscreen]);

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${apiBaseUrl}/api/v1/citizens/me/documents`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("locker.failed_load"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!isOffline) loadDocuments();
    else {
      setLoading(false);
      setError(t("locker.offline"));
    }
  }, [isOffline, loadDocuments]);

  const loadVersions = async (docTypeId: string) => {
    if (expandedDocType === docTypeId) {
      setExpandedDocType(null);
      return;
    }
    setExpandedDocType(docTypeId);
    setVersionsLoading(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/citizens/me/documents/${encodeURIComponent(docTypeId)}/versions`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const fetchDocBlob = useCallback(
    async (citizenDocId: string): Promise<{ url: string; mime: string }> => {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/citizens/me/documents/${citizenDocId}/download`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed to fetch document");
      const mime = res.headers.get("content-type") || "application/octet-stream";
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), mime };
    },
    [authHeaders]
  );

  const handlePreview = useCallback(
    async (doc: CitizenDoc | VersionEntry) => {
      setPreviewDoc(doc);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewBlobUrl(null);
      setFullscreen(false);
      try {
        const docId = "citizen_doc_id" in doc ? doc.citizen_doc_id : (doc as any).citizen_doc_id;
        const { url, mime } = await fetchDocBlob(docId);
        setPreviewBlobUrl(url);
        setPreviewMimeType(mime);
      } catch (err) {
        setPreviewError(t("locker.failed_preview"));
      } finally {
        setPreviewLoading(false);
      }
    },
    [fetchDocBlob]
  );

  const handleDownload = useCallback(
    async (doc: CitizenDoc | VersionEntry) => {
      try {
        const docId = "citizen_doc_id" in doc ? doc.citizen_doc_id : (doc as any).citizen_doc_id;
        const { url } = await fetchDocBlob(docId);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.original_filename || "document";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        setError(t("locker.failed_download"));
      }
    },
    [fetchDocBlob]
  );

  const handleUploadNewVersion = async (docTypeId: string, file: File) => {
    if (isOffline) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("docTypeId", docTypeId);
      form.append("file", file);
      if (uploadValidFrom) form.append("validFrom", uploadValidFrom);
      if (uploadValidUntil) form.append("validUntil", uploadValidUntil);

      // Simulate progress for UX (actual XHR progress would need XMLHttpRequest)
      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 15, 90));
      }, 200);

      const res = await fetch(`${apiBaseUrl}/api/v1/citizens/me/documents/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      clearInterval(progressTimer);
      setUploadProgress(100);

      if (!res.ok) throw new Error("Upload failed");
      setPendingFile(null);
      setUploadingDocType(null);
      setUploadValidFrom("");
      setUploadValidUntil("");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewDoc(null);
    setPreviewBlobUrl(null);
    setPreviewMimeType("");
    setPreviewError(null);
    setFullscreen(false);
  };

  const isImage = previewMimeType.startsWith("image/");
  const isPdf = previewMimeType === "application/pdf";

  // Filter and sort documents
  const filteredDocuments = documents.filter((doc) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesFilename = (doc.original_filename || "").toLowerCase().includes(q);
      const matchesDocType = humanizeDocType(doc.doc_type_id).toLowerCase().includes(q);
      if (!matchesFilename && !matchesDocType) return false;
    }
    // Status filter
    if (activeFilter === "all") return true;
    if (activeFilter === "valid") return doc.computed_status === "VALID";
    if (activeFilter === "expired") return doc.computed_status === "EXPIRED";
    if (activeFilter === "mismatch") return doc.computed_status === "MISMATCH";
    if (activeFilter === "cancelled") return doc.computed_status === "CANCELLED";
    return true;
  });

  const sortedDocuments = [...filteredDocuments].sort((a, b) => {
    if (sortBy === "newest") return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
    if (sortBy === "oldest") return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
    return humanizeDocType(a.doc_type_id).localeCompare(humanizeDocType(b.doc_type_id));
  });

  return (
    <div className="document-locker">
      {error && <Alert variant="error">{error}</Alert>}

      {loading && (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {[1, 2, 3].map((i) => <SkeletonBlock key={i} height="5rem" />)}
        </div>
      )}

      {!loading && documents.length === 0 && !error && (
        <div className="locker-empty">
          <div className="locker-empty-icon">
            <svg viewBox="0 0 24 24">
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v6h5" />
            </svg>
          </div>
          <h3><Bilingual tKey="locker.empty_title" /></h3>
          <p>{t("locker.empty_desc")}</p>
          <Button onClick={onBack} variant="secondary">
            {t("locker.back_to_dashboard")}
          </Button>
        </div>
      )}

      {!loading && documents.length > 0 && (() => {
        const uploadedDocs = sortedDocuments.filter((d) => d.origin !== "issued");
        const issuedDocs = sortedDocuments.filter((d) => d.origin === "issued");

        const renderDocCard = (doc: CitizenDoc) => {
          const disabled = doc.computed_status === "CANCELLED" || doc.computed_status === "EXPIRED";
          return (
            <Card key={doc.citizen_doc_id} className={`locker-card ${disabled ? "locker-card--disabled" : ""}`}>
              <div className="locker-card-header">
                <span className="locker-card-title">
                  {humanizeDocType(doc.doc_type_id)}
                </span>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <span className={getStatusBadgeClass(doc.computed_status)}>
                    {getStatusLabel(doc.computed_status, t)}
                  </span>
                  <span className="locker-card-version">v{doc.citizen_version}</span>
                </div>
              </div>

              <div className="locker-card-meta">
                <span>{doc.original_filename || "—"}</span>
                <span>{formatDate(doc.uploaded_at)}</span>
                <span>{formatBytes(doc.size_bytes)}</span>
                {doc.valid_until && (() => {
                  const days = daysUntilExpiry(doc.valid_until);
                  const label = days === null ? ""
                    : days <= 0 ? `${t("common.expired")} (${formatDate(doc.valid_until)})`
                    : days <= 90 ? `${t("common.expires_in", { days })} (${formatDate(doc.valid_until)})`
                    : `${t("common.valid_until")} ${formatDate(doc.valid_until)}`;
                  return (
                    <span className={`locker-expiry ${getExpiryClass(days)}`}>
                      {label}
                    </span>
                  );
                })()}
              </div>

              {doc.origin === "issued" && doc.source_arn && (
                <div className="locker-card-apps">
                  <strong>{t("locker.issued_for")}</strong>{" "}
                  <span className="locker-app-arn">{doc.source_arn}</span>
                </div>
              )}

              {doc.origin !== "issued" && doc.linked_applications && doc.linked_applications.length > 0 && (
                <div className="locker-card-apps">
                  <strong>{t("locker.used_in")}</strong>
                  <div className="locker-app-links">
                    {doc.linked_applications.map((app) => (
                      <div key={app.arn} className="locker-app-link">
                        <span className="locker-app-arn">{app.arn}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="locker-card-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handlePreview(doc)}
                  disabled={isOffline}
                >
                  {t("locker.preview")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleDownload(doc)}
                  disabled={isOffline || !isDownloadable(doc)}
                  title={!isDownloadable(doc) ? t("locker.not_downloadable") : undefined}
                >
                  {t("locker.download")}
                </Button>
                {doc.origin !== "issued" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setUploadingDocType(
                        uploadingDocType === doc.doc_type_id ? null : doc.doc_type_id
                      )
                    }
                    disabled={isOffline || uploading}
                  >
                    {t("locker.upload_new_version")}
                  </Button>
                )}
                {doc.citizen_version > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void loadVersions(doc.doc_type_id)}
                  >
                    {expandedDocType === doc.doc_type_id ? t("locker.hide_history") : t("locker.version_history")}
                  </Button>
                )}
              </div>

              {uploadingDocType === doc.doc_type_id && doc.origin !== "issued" && (
                <div className="locker-upload-section">
                  {!pendingFile ? (
                    <DropZone
                      onFileSelected={(f) => setPendingFile(f)}
                      disabled={uploading || isOffline}
                      label={t("locker.drop_file", { docType: humanizeDocType(doc.doc_type_id) })}
                    />
                  ) : (
                    <>
                    <UploadConfirm
                      file={pendingFile}
                      uploading={uploading}
                      progress={uploadProgress}
                      onConfirm={() => {
                        void handleUploadNewVersion(doc.doc_type_id, pendingFile);
                      }}
                      onCancel={() => {
                        setPendingFile(null);
                        setUploadingDocType(null);
                        setUploadValidFrom("");
                        setUploadValidUntil("");
                      }}
                    />
                    <div className="locker-expiry-fields">
                      <Field label={<Bilingual tKey="locker.valid_from" />} htmlFor={`valid-from-${doc.doc_type_id}`}>
                        <Input
                          id={`valid-from-${doc.doc_type_id}`}
                          type="date"
                          value={uploadValidFrom}
                          onChange={(e) => setUploadValidFrom(e.target.value)}
                          disabled={uploading}
                        />
                      </Field>
                      <Field label={<Bilingual tKey="locker.valid_until" />} htmlFor={`valid-until-${doc.doc_type_id}`}>
                        <Input
                          id={`valid-until-${doc.doc_type_id}`}
                          type="date"
                          value={uploadValidUntil}
                          onChange={(e) => setUploadValidUntil(e.target.value)}
                          disabled={uploading}
                        />
                      </Field>
                    </div>
                    </>
                  )}
                </div>
              )}

              {expandedDocType === doc.doc_type_id && (
                <div className="locker-version-list">
                  {versionsLoading && <p>{t("locker.loading_versions")}</p>}
                  {!versionsLoading &&
                    versions.map((v) => (
                      <div key={v.citizen_doc_id} className="locker-version-row">
                        <span className="version-label">
                          v{v.citizen_version} — {v.original_filename || "—"} —{" "}
                          {formatDate(v.uploaded_at)} — {formatBytes(v.size_bytes)}
                        </span>
                        <div style={{ display: "flex", gap: "var(--space-1)" }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handlePreview(v)}
                          >
                            {t("locker.preview")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleDownload(v)}
                          >
                            {t("locker.download")}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          );
        };

        return (
          <>
          <div className="locker-toolbar">
            <input
              type="text"
              className="ui-input locker-search"
              placeholder={t("locker.search_placeholder")}
              aria-label="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="locker-filters">
              {(["all", "valid", "expired", "mismatch", "cancelled"] as FilterOption[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`locker-filter-chip ${activeFilter === f ? "locker-filter-chip--active" : ""}`}
                  onClick={() => setActiveFilter(f)}
                >
                  {f === "all" ? t("locker.filter_all") : t(`locker.status_${f}`)}
                </button>
              ))}
            </div>
            <select
              className="locker-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="newest">{t("locker.sort_newest")}</option>
              <option value="oldest">{t("locker.sort_oldest")}</option>
              <option value="az">{t("locker.sort_az")}</option>
            </select>
            <div className="locker-result-count">
              {t("locker.showing_count", { shown: sortedDocuments.length, total: documents.length })}
            </div>
          </div>

          {uploadedDocs.length > 0 && (
            <>
              <div className="locker-section-header">
                <h3>{t("locker.section_uploaded")}</h3>
                <span className="locker-section-count">{uploadedDocs.length}</span>
              </div>
              <div className="locker-cards">
                {uploadedDocs.map(renderDocCard)}
              </div>
            </>
          )}

          {issuedDocs.length > 0 && (
            <>
              <div className="locker-section-header">
                <h3>{t("locker.section_issued")}</h3>
                <span className="locker-section-count">{issuedDocs.length}</span>
              </div>
              <div className="locker-cards">
                {issuedDocs.map(renderDocCard)}
              </div>
            </>
          )}
          </>
        );
      })()}

      {/* Preview Modal */}
      <Modal
        open={!!previewDoc && !fullscreen}
        onClose={closePreview}
        title={(previewDoc as any)?.original_filename || "Document Preview"}
        className="locker-preview-modal"
        actions={
          <>
            <Button variant="ghost" onClick={closePreview}>
              {t("locker.close")}
            </Button>
            {previewBlobUrl && (
              <Button variant="secondary" onClick={() => setFullscreen(true)}>
                {t("locker.fullscreen")}
              </Button>
            )}
            {previewDoc && (
              <Button variant="secondary" onClick={() => void handleDownload(previewDoc)}>
                {t("locker.download")}
              </Button>
            )}
          </>
        }
      >
        <div className="locker-preview-content">
          {previewLoading && <p className="locker-preview-loading">Loading preview...</p>}
          {previewError && <Alert variant="error">{previewError}</Alert>}
          {previewBlobUrl && isImage && (
            <img
              src={previewBlobUrl}
              alt={(previewDoc as any)?.original_filename || "Document"}
              className="locker-preview-img"
            />
          )}
          {previewBlobUrl && isPdf && (
            <iframe
              src={previewBlobUrl}
              title={(previewDoc as any)?.original_filename || "Document"}
              className="locker-preview-iframe"
            />
          )}
          {previewBlobUrl && !isImage && !isPdf && (
            <div className="locker-preview-unsupported">
              <p>{t("locker.preview_unavailable")}</p>
              <Button variant="secondary" onClick={() => void handleDownload(previewDoc!)}>
                {t("locker.download_to_view")}
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Fullscreen preview */}
      {fullscreen && previewDoc && (
        <div
          className="locker-fullscreen"
          role="dialog"
          aria-label="Fullscreen document preview"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Escape") { setFullscreen(false); return; }
            // Focus trap
            if (e.key === "Tab") {
              const container = e.currentTarget;
              const focusable = container.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
              );
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
              } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
              }
            }
          }}
          tabIndex={-1}
          ref={(el) => { el?.focus(); }}
        >
          <div className="locker-fullscreen__toolbar">
            <span className="locker-fullscreen__filename">
              {(previewDoc as any)?.original_filename || "Document"}
            </span>
            <div className="locker-fullscreen__actions">
              <Button variant="ghost" onClick={() => void handleDownload(previewDoc)}>
                {t("locker.download")}
              </Button>
              <Button variant="ghost" onClick={() => setFullscreen(false)}>
                {t("locker.exit_fullscreen")}
              </Button>
              <Button variant="ghost" onClick={closePreview}>
                {t("locker.close")}
              </Button>
            </div>
          </div>
          <div className="locker-fullscreen__body">
            {previewBlobUrl && isImage && (
              <img
                src={previewBlobUrl}
                alt={(previewDoc as any)?.original_filename || "Document"}
                className="locker-preview-img"
              />
            )}
            {previewBlobUrl && isPdf && (
              <iframe
                src={previewBlobUrl}
                title={(previewDoc as any)?.original_filename || "Document"}
                className="locker-preview-iframe"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
