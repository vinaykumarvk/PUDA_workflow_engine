import { useState, useEffect, useCallback } from "react";
import { Alert, Button, Card, Field, SkeletonBlock, Textarea } from "@puda/shared";
import { apiBaseUrl } from "./types";

interface Complaint {
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
  evidence?: Evidence[];
}

interface Evidence {
  evidence_id: string;
  complaint_id: string;
  storage_key: string;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at: string;
  uploaded_by: string;
}

interface ComplaintManagementProps {
  authHeaders: () => Record<string, string>;
  isOffline: boolean;
  onBack: () => void;
}

const VIOLATION_LABELS: Record<string, string> = {
  UNAUTHORIZED_CONSTRUCTION: "Construction Without Approval",
  PLAN_DEVIATION: "Deviation from Approved Plan",
  ENCROACHMENT: "Encroachment on Public/Govt Land",
  HEIGHT_VIOLATION: "Excess Floors / Height Violation",
  SETBACK_VIOLATION: "Setback / Open Space Violation",
  CHANGE_OF_USE: "Unauthorized Change of Land Use",
  UNAUTHORIZED_COLONY: "Unauthorized Colony / Layout",
  OTHER: "Other Violation",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  INSPECTION_ORDERED: "Inspection Ordered",
  ACTION_TAKEN: "Action Taken",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REJECTED: "Rejected",
};

const STATUS_OPTIONS = [
  "UNDER_REVIEW",
  "INSPECTION_ORDERED",
  "ACTION_TAKEN",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "SUBMITTED": return "badge badge-pending";
    case "UNDER_REVIEW": return "badge badge-query";
    case "INSPECTION_ORDERED": return "badge badge-query";
    case "ACTION_TAKEN": return "badge badge-approved";
    case "RESOLVED": return "badge badge-approved";
    case "CLOSED": return "badge";
    case "REJECTED": return "badge badge-rejected";
    default: return "badge";
  }
}

export default function ComplaintManagement({
  authHeaders,
  isOffline,
  onBack,
}: ComplaintManagementProps) {
  const [subView, setSubView] = useState<"list" | "detail">("list");
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterViolation, setFilterViolation] = useState("");

  // Detail view
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status update
  const [newStatus, setNewStatus] = useState("");
  const [officerRemarks, setOfficerRemarks] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "warning"; text: string } | null>(null);

  // Evidence preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState("");

  const loadComplaints = useCallback(async () => {
    if (isOffline) {
      setError("Offline mode is active. Complaint data is unavailable.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterViolation) params.set("violationType", filterViolation);
      params.set("limit", "50");
      const res = await fetch(
        `${apiBaseUrl}/api/v1/officer/complaints?${params.toString()}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setComplaints(data.complaints || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filterStatus, filterViolation, isOffline]);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  const openDetail = async (complaint: Complaint) => {
    if (isOffline) return;
    setDetailLoading(true);
    setFeedback(null);
    setNewStatus("");
    setOfficerRemarks("");
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/officer/complaints/${encodeURIComponent(complaint.complaint_number)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setSelected(data);
      setSubView("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load complaint");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selected || !newStatus) return;
    if (isOffline) {
      setFeedback({ variant: "warning", text: "Offline mode is active." });
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/officer/complaints/${encodeURIComponent(selected.complaint_number)}/status`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            status: newStatus,
            officerRemarks: officerRemarks || undefined,
          }),
        }
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || errData.error || "Status update failed");
      }
      const updated = await res.json();
      setSelected({ ...selected, ...updated });
      setFeedback({ variant: "success", text: `Status updated to ${STATUS_LABELS[newStatus] || newStatus}` });
      setNewStatus("");
      setOfficerRemarks("");
      // Refresh list in background
      void loadComplaints();
    } catch (err) {
      setFeedback({ variant: "error", text: err instanceof Error ? err.message : "Status update failed" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvidencePreview = async (evidenceId: string, complaintNumber: string, filename: string) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/officer/complaints/${encodeURIComponent(complaintNumber)}/evidence/${evidenceId}/file`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed to fetch evidence");
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewFilename(filename || "evidence");
    } catch {
      setFeedback({ variant: "error", text: "Failed to load evidence file." });
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFilename("");
  };

  const backToList = () => {
    setSelected(null);
    setSubView("list");
    setFeedback(null);
    closePreview();
  };

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // --- Detail View ---
  if (subView === "detail" && selected) {
    const terminalStatuses = ["RESOLVED", "CLOSED", "REJECTED"];
    const isTerminal = terminalStatuses.includes(selected.status);

    return (
      <>
        <Button onClick={backToList} variant="ghost" className="back-button">
          &larr; Back to Complaints
        </Button>
        <h1 style={{ marginTop: "var(--space-3)" }}>Complaint Detail</h1>
        <p className="subtitle">{selected.complaint_number}</p>

        <div className="panel" style={{ marginTop: "var(--space-4)" }}>
          {feedback && <Alert variant={feedback.variant} className="task-feedback">{feedback.text}</Alert>}

          {/* Complaint Info */}
          <Card className="detail-read-card">
            <div className="read-card-header">
              <p className="read-card-title">{selected.subject}</p>
              <span className={statusBadgeClass(selected.status)}>{STATUS_LABELS[selected.status] || selected.status}</span>
            </div>
            <div className="read-card-grid">
              <div className="read-meta-row">
                <span className="read-meta-key">Violation Type</span>
                <span className="read-meta-value">{VIOLATION_LABELS[selected.violation_type] || selected.violation_type}</span>
              </div>
              <div className="read-meta-row">
                <span className="read-meta-key">Filed On</span>
                <span className="read-meta-value">{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              <div className="read-meta-row">
                <span className="read-meta-key">Last Updated</span>
                <span className="read-meta-value">{new Date(selected.updated_at).toLocaleString()}</span>
              </div>
              {selected.resolved_at && (
                <div className="read-meta-row">
                  <span className="read-meta-key">Resolved At</span>
                  <span className="read-meta-value">{new Date(selected.resolved_at).toLocaleString()}</span>
                </div>
              )}
              <div className="read-meta-row">
                <span className="read-meta-key">Citizen ID</span>
                <span className="read-meta-value">{selected.user_id}</span>
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card className="detail-read-card">
            <p className="read-card-title">Description</p>
            <p className="read-card-body">{selected.description}</p>
          </Card>

          {/* Location */}
          <Card className="detail-read-card">
            <p className="read-card-title">Location</p>
            <div className="read-card-grid">
              <div className="read-meta-row">
                <span className="read-meta-key">Address</span>
                <span className="read-meta-value">{selected.location_address}</span>
              </div>
              {selected.location_locality && (
                <div className="read-meta-row">
                  <span className="read-meta-key">Locality</span>
                  <span className="read-meta-value">{selected.location_locality}</span>
                </div>
              )}
              <div className="read-meta-row">
                <span className="read-meta-key">City</span>
                <span className="read-meta-value">{selected.location_city}</span>
              </div>
              <div className="read-meta-row">
                <span className="read-meta-key">District</span>
                <span className="read-meta-value">{selected.location_district}</span>
              </div>
              {selected.location_pincode && (
                <div className="read-meta-row">
                  <span className="read-meta-key">Pincode</span>
                  <span className="read-meta-value">{selected.location_pincode}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Officer Remarks */}
          {selected.officer_remarks && (
            <Card className="detail-read-card">
              <p className="read-card-title">Officer Remarks</p>
              <p className="read-card-body">{selected.officer_remarks}</p>
            </Card>
          )}

          {/* Evidence */}
          <div className="documents-section">
            <h2>Evidence ({selected.evidence?.length || 0})</h2>
            {selected.evidence && selected.evidence.length > 0 ? (
              <div className="detail-card-list">
                {selected.evidence.map((ev) => (
                  <Card key={ev.evidence_id} className="detail-read-card">
                    <div className="read-card-header">
                      <p className="read-card-title">{ev.original_filename || "Evidence"}</p>
                      <span className="badge">{ev.mime_type || "unknown"}</span>
                    </div>
                    <div className="read-card-grid">
                      <div className="read-meta-row">
                        <span className="read-meta-key">Uploaded</span>
                        <span className="read-meta-value">{new Date(ev.uploaded_at).toLocaleString()}</span>
                      </div>
                      {ev.size_bytes != null && (
                        <div className="read-meta-row">
                          <span className="read-meta-key">Size</span>
                          <span className="read-meta-value">{(ev.size_bytes / 1024).toFixed(1)} KB</span>
                        </div>
                      )}
                    </div>
                    <div className="doc-actions">
                      <Button
                        variant="ghost"
                        className="doc-actions__btn"
                        onClick={() => void handleEvidencePreview(ev.evidence_id, selected.complaint_number, ev.original_filename || "evidence")}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Preview
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert variant="info" className="empty-read-alert">No evidence files uploaded for this complaint.</Alert>
            )}
          </div>

          {/* Evidence Preview */}
          {previewUrl && (
            <div className="complaint-evidence-preview">
              <div className="complaint-evidence-preview__header">
                <span>{previewFilename}</span>
                <Button variant="ghost" onClick={closePreview}>Close</Button>
              </div>
              <img src={previewUrl} alt={previewFilename} className="complaint-evidence-preview__img" />
            </div>
          )}

          {/* Status Update Action */}
          {!isTerminal && (
            <div className="action-panel">
              <h2>Update Status</h2>
              <div className="action-form">
                <Field label="New Status" htmlFor="complaint-new-status" required>
                  <select
                    id="complaint-new-status"
                    className="ui-input"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    disabled={isOffline || actionLoading}
                  >
                    <option value="">Select status...</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Officer Remarks" htmlFor="complaint-remarks">
                  <Textarea
                    id="complaint-remarks"
                    value={officerRemarks}
                    onChange={(e) => setOfficerRemarks(e.target.value)}
                    rows={3}
                    placeholder="Add remarks about the status change..."
                    disabled={isOffline || actionLoading}
                  />
                </Field>
                <div className="action-form-buttons">
                  <Button
                    onClick={() => void handleStatusUpdate()}
                    className="submit-action"
                    disabled={isOffline || actionLoading || !newStatus}
                  >
                    {actionLoading ? "Updating..." : "Update Status"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // --- List View ---
  return (
    <>
      <h1>Complaint Management</h1>
      <p className="subtitle">Review and manage citizen complaints ({total} total)</p>

        {/* Filters */}
        <div className="complaint-filters">
          <select
            className="ui-input complaint-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            className="ui-input complaint-filter-select"
            value={filterViolation}
            onChange={(e) => setFilterViolation(e.target.value)}
          >
            <option value="">All Violation Types</option>
            {Object.entries(VIOLATION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {error && <Alert variant="error" className="view-feedback">{error}</Alert>}

        {loading || detailLoading ? (
          <div className="panel">
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
          </div>
        ) : complaints.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h3>No complaints found</h3>
            <p>{filterStatus || filterViolation ? "No complaints matching the selected filters." : "No complaints have been submitted yet."}</p>
          </div>
        ) : (
          <ul className="task-list">
            {complaints.map((c) => (
              <li key={c.complaint_id}>
                <Button
                  className="task-card task-card-wrap"
                  onClick={() => void openDetail(c)}
                  variant="ghost"
                >
                  <div className="task-card" role="presentation">
                    <div>
                      <h2>{c.subject}</h2>
                      <p>{c.complaint_number}</p>
                      <p>{VIOLATION_LABELS[c.violation_type] || c.violation_type} &middot; {c.location_address}</p>
                      <p>{new Date(c.created_at).toLocaleDateString()}{c.evidence_count ? ` \u00b7 ${c.evidence_count} evidence file(s)` : ""}</p>
                    </div>
                    <span className={statusBadgeClass(c.status)}>{STATUS_LABELS[c.status] || c.status}</span>
                  </div>
                </Button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
