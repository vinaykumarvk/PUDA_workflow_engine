import { useState, useEffect } from "react";
import { Alert, Button, Card, Field, Input, Modal, Textarea } from "@puda/shared";
import { Task, Application, apiBaseUrl } from "./types";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./theme";

// Field label map for structured data display
const FIELD_LABELS: Record<string, string> = {
  full_name: "Full Name", father_name: "Father's Name", date_of_birth: "Date of Birth",
  email: "Email", mobile: "Mobile", aadhaar: "Aadhaar", pan: "PAN",
  salutation: "Salutation", gender: "Gender", marital_status: "Marital Status", remark: "Remark",
  upn: "Unique Property Number", area_sqyd: "Area (sq. yd.)", plot_no: "Plot No.",
  type: "Property Type", scheme_name: "Scheme Name", authority_name: "Authority",
  plan_sanction_date: "Plan Sanction Date", floors_constructed: "Floors Constructed",
  basement_constructed: "Basement Constructed", basement_area_sqft: "Basement Area (sq. ft.)",
  ground_floor_area_sqft: "Ground Floor Area (sq. ft.)", first_floor_area_sqft: "First Floor Area (sq. ft.)",
  second_floor_area_sqft: "Second Floor Area (sq. ft.)", mumty_constructed: "Mumty Constructed",
  mumty_area_sqft: "Mumty Area (sq. ft.)", estimated_cost: "Estimated Cost",
  purpose: "Purpose", service_pipe_length_ft: "Service Pipe Length (ft.)",
  service_pipe_size: "Service Pipe Size", number_of_taps: "Number of Taps",
  tap_size: "Tap Size", ferrule_cock_size: "Ferrule Cock Size",
  status: "Status", number_of_seats: "Number of Seats",
  hot_water_fitting_material: "Hot Water Fitting Material",
  installation_bill_no: "Installation Bill No.", name: "Name",
  license_no: "License No.", address: "Address", certificate_date: "Certificate Date",
  certificate_number: "Certificate Number", valid_from: "Valid From", valid_till: "Valid Till",
  line1: "Address Line 1", state: "State", district: "District", pincode: "Pincode",
  same_as_permanent: "Same as Permanent", payment_details_updated: "Payment Details Updated",
  authority_id: "Authority ID",
};

function humanizeKey(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function renderStructuredData(data: any): JSX.Element {
  if (!data || typeof data !== "object") return <p>{String(data ?? "—")}</p>;
  return (
    <div className="structured-data">
      {Object.entries(data).map(([sectionKey, sectionValue]) => {
        if (sectionValue && typeof sectionValue === "object" && !Array.isArray(sectionValue)) {
          return (
            <div key={sectionKey} className="data-section">
              <h3 className="data-section-title">
                {humanizeKey(sectionKey)}
              </h3>
              <table className="data-table">
                <tbody>
                  {Object.entries(sectionValue as Record<string, any>).map(([k, v]) => {
                    if (v && typeof v === "object" && !Array.isArray(v)) {
                      return (
                        <tr key={k}>
                          <td colSpan={2} className="data-table-group-cell">
                            <strong className="data-table-group-title">{humanizeKey(k)}</strong>
                            <table className="data-table data-table--nested">
                              <tbody>
                                {Object.entries(v as Record<string, any>).map(([sk, sv]) => (
                                  <tr key={sk}>
                                    <td className="data-table-key data-table-key--nested">{humanizeKey(sk)}</td>
                                    <td className="data-table-value data-table-value--nested">{formatValue(sv)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={k}>
                        <td className="data-table-key">{humanizeKey(k)}</td>
                        <td className="data-table-value">{formatValue(v)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <div key={sectionKey} className="data-inline-row">
            <strong className="data-inline-key">{humanizeKey(sectionKey)}:</strong> {formatValue(sectionValue)}
          </div>
        );
      })}
    </div>
  );
}

interface TaskDetailProps {
  task: Task;
  application: Application;
  serviceConfig: any;
  officerUserId: string;
  authHeaders: () => Record<string, string>;
  isOffline: boolean;
  fromSearch: boolean;
  onBack: () => void;
  onActionComplete: (feedback?: { variant: "info" | "success" | "warning" | "error"; text: string }) => void;
}

export default function TaskDetail({
  task,
  application,
  serviceConfig,
  officerUserId,
  authHeaders,
  isOffline,
  fromSearch,
  onBack,
  onActionComplete,
}: TaskDetailProps) {
  const { theme, resolvedTheme, setTheme } = useTheme("puda_officer_theme");
  const [feedback, setFeedback] = useState<{ variant: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const [action, setAction] = useState<"FORWARD" | "QUERY" | "APPROVE" | "REJECT" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [unlockedFields, setUnlockedFields] = useState<string[]>([]);
  const [unlockedDocuments, setUnlockedDocuments] = useState<string[]>([]);
  const [verificationChecklist, setVerificationChecklist] = useState<Record<string, boolean>>({});
  const [verificationRemarks, setVerificationRemarks] = useState("");
  const [checklistItems, setChecklistItems] = useState<Array<{ key: string; label: string; required?: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setConfirmOpen(false);
    setFeedback(null);
    setError(null);
  }, [action]);

  useEffect(() => {
    if (!serviceConfig || !application) {
      setChecklistItems([]);
      setVerificationChecklist({});
      setVerificationRemarks("");
      return;
    }
    const currentState = serviceConfig.workflow?.states?.find((s: any) => s.stateId === application.state_id);
    const checklist = currentState?.taskUi?.checklist || [];
    setChecklistItems(checklist);
    const nextChecklist: Record<string, boolean> = {};
    checklist.forEach((item: any) => { nextChecklist[item.key] = false; });
    setVerificationChecklist(nextChecklist);
    setVerificationRemarks("");
  }, [serviceConfig, application?.state_id]);

  const handleAction = async (confirmed = false) => {
    if (!task || !action) return;
    if (isOffline) {
      setError(null);
      setFeedback({ variant: "warning", text: "You are offline. Workflow actions are disabled in read-only mode." });
      return;
    }
    if (action === "QUERY" && !queryMessage.trim()) {
      setError(null);
      setFeedback({ variant: "warning", text: "Query message is required before submitting a query." });
      return;
    }
    if (action === "REJECT" && !remarks.trim()) {
      setError(null);
      setFeedback({ variant: "warning", text: "Remarks are required when rejecting an application." });
      return;
    }
    if (!confirmed && (action === "APPROVE" || action === "REJECT")) {
      setConfirmOpen(true);
      return;
    }

    setActionLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const body: any = { action, userId: officerUserId, remarks };
      if (action === "QUERY") {
        body.queryMessage = queryMessage;
        body.unlockedFields = unlockedFields;
        body.unlockedDocuments = unlockedDocuments;
      }
      if (Object.keys(verificationChecklist).length > 0 || verificationRemarks) {
        body.verificationData = { checklist: verificationChecklist, remarks: verificationRemarks };
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/tasks/${task.task_id}/actions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Action failed");
      }
      onActionComplete({ variant: "success", text: `Action ${action} completed successfully.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setFeedback(null);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="page">
      <a href="#officer-task-main" className="skip-link">
        Skip to main content
      </a>
      <header className="page__header">
        <div className="topbar">
          <div>
            <Button onClick={onBack} className="back-button" variant="ghost">
              ← Back to {fromSearch ? "Search" : "Inbox"}
            </Button>
            <h1>Application Review</h1>
            <p className="subtitle">ARN: {application.arn}</p>
          </div>
          <ThemeToggle
            theme={theme}
            resolvedTheme={resolvedTheme}
            onThemeChange={setTheme}
            idSuffix="officer-task-detail"
          />
        </div>
      </header>

      <main id="officer-task-main" className="panel" role="main">
        {isOffline ? (
          <Alert variant="warning" className="task-feedback">
            Offline mode is active. Changes are disabled.
          </Alert>
        ) : null}
        {feedback ? <Alert variant={feedback.variant} className="task-feedback">{feedback.text}</Alert> : null}
        {application.sla_due_at && (
          <div className="sla-banner">
            <strong>SLA due:</strong> {new Date(application.sla_due_at).toLocaleString()}
            {new Date(application.sla_due_at) < new Date() && <span className="sla-overdue"> (Overdue)</span>}
          </div>
        )}

        <div className="application-details">
          <h2>Application Data</h2>
          {renderStructuredData(application.data_jsonb)}
        </div>

        {checklistItems.length > 0 && (
          <div className="verification-section">
            <h2>Verification Checklist</h2>
            <div className="checklist-items">
              {checklistItems.map((item) => (
                <label key={item.key} className="checklist-item">
                  <input
                    type="checkbox"
                    checked={verificationChecklist[item.key] || false}
                    disabled={isOffline || actionLoading}
                    onChange={(e) => setVerificationChecklist({ ...verificationChecklist, [item.key]: e.target.checked })}
                  />
                  <span>{item.label}{item.required ? " *" : ""}</span>
                </label>
              ))}
            </div>
            <Field label="Verification Remarks" htmlFor="verification-remarks">
              <Textarea
                id="verification-remarks"
                value={verificationRemarks}
                onChange={(e) => setVerificationRemarks(e.target.value)}
                rows={3}
                placeholder="Enter verification remarks..."
                disabled={isOffline || actionLoading}
              />
            </Field>
          </div>
        )}

        <div className="documents-section">
          <h2>Documents ({application.documents.length})</h2>
          {application.documents.length > 0 ? (
            <div className="detail-card-list">
              {application.documents.map((doc) => (
                <Card key={doc.doc_id} className="detail-read-card">
                  <div className="read-card-header">
                    <p className="read-card-title">{doc.original_filename}</p>
                    <span className="badge">{doc.verification_status || "Pending"}</span>
                  </div>
                  <div className="read-card-grid">
                    <div className="read-meta-row">
                      <span className="read-meta-key">Document Type</span>
                      <span className="read-meta-value">{doc.doc_type_id || "—"}</span>
                    </div>
                    <div className="read-meta-row">
                      <span className="read-meta-key">Document ID</span>
                      <span className="read-meta-value">{doc.doc_id}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Alert variant="info" className="empty-read-alert">
              No documents uploaded yet for this application.
            </Alert>
          )}
        </div>

        <div className="queries-section">
          <h2>Queries ({application.queries.length})</h2>
          {application.queries.length > 0 ? (
            <div className="detail-card-list">
              {application.queries.map((q) => (
                <Card key={q.query_id} className="detail-read-card query-item">
                  <div className="read-card-header">
                    <p className="read-card-title">Query #{q.query_number}</p>
                    <span className="badge">{q.status || "PENDING"}</span>
                  </div>
                  <p className="read-card-body">{q.message}</p>
                  <div className="read-card-grid">
                    <div className="read-meta-row">
                      <span className="read-meta-key">Raised At</span>
                      <span className="read-meta-value">
                        {q.raised_at ? new Date(q.raised_at).toLocaleString() : "—"}
                      </span>
                    </div>
                    <div className="read-meta-row">
                      <span className="read-meta-key">Responded At</span>
                      <span className="read-meta-value">
                        {q.responded_at ? new Date(q.responded_at).toLocaleString() : "—"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Alert variant="info" className="empty-read-alert">
              No queries have been raised for this application.
            </Alert>
          )}
        </div>

        <div className="timeline-section">
          <h2>Timeline ({application.timeline.length})</h2>
          {application.timeline.length > 0 ? (
            <div className="detail-card-list">
              {application.timeline.map((event, idx) => (
                <Card key={idx} className="detail-read-card timeline-item-card">
                  <p className="read-card-title">{event.event_type}</p>
                  <div className="read-card-grid">
                    <div className="read-meta-row">
                      <span className="read-meta-key">Timestamp</span>
                      <span className="read-meta-value">
                        {event.created_at ? new Date(event.created_at).toLocaleString() : "—"}
                      </span>
                    </div>
                    <div className="read-meta-row">
                      <span className="read-meta-key">Actor</span>
                      <span className="read-meta-value">
                        {event.actor_id || event.actor_type || "System"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Alert variant="info" className="empty-read-alert">
              Timeline events are not available yet.
            </Alert>
          )}
        </div>

        {(application.disposal_type === "APPROVED" || application.disposal_type === "REJECTED") && (
          <div className="output-download">
            <a href={`${apiBaseUrl}/api/v1/applications/${application.arn}/output/download`} target="_blank" rel="noopener noreferrer" className="download-link">
              Download {application.disposal_type === "APPROVED" ? "Certificate" : "Order"}
            </a>
          </div>
        )}

        {error ? <Alert variant="error">{error}</Alert> : null}

        {!fromSearch && !["APPROVED", "REJECTED", "CLOSED"].includes(application.state_id) && task.task_id && (
          <div className="action-panel">
            <h2>Take Action</h2>
            <div className="action-buttons">
              <Button onClick={() => setAction("FORWARD")} className="action-btn forward" variant="secondary" disabled={isOffline || actionLoading}>Forward</Button>
              <Button onClick={() => setAction("QUERY")} className="action-btn query" variant="secondary" disabled={isOffline || actionLoading}>Raise Query</Button>
              <Button onClick={() => setAction("APPROVE")} className="action-btn approve" variant="secondary" disabled={isOffline || actionLoading}>Approve</Button>
              <Button onClick={() => setAction("REJECT")} className="action-btn reject" variant="secondary" disabled={isOffline || actionLoading}>Reject</Button>
            </div>

            {action && (
              <div className="action-form">
                {action === "QUERY" && (
                  <>
                    <Field label="Query Message" htmlFor="query-message" required>
                      <Textarea
                        id="query-message"
                        value={queryMessage}
                        onChange={(e) => setQueryMessage(e.target.value)}
                        rows={3}
                        disabled={isOffline || actionLoading}
                      />
                    </Field>
                    <Field label="Unlock Fields (comma-separated)" htmlFor="unlock-fields">
                      <Input
                        id="unlock-fields"
                        type="text"
                        value={unlockedFields.join(", ")}
                        onChange={(e) =>
                          setUnlockedFields(
                            e.target.value.split(",").map((s) => s.trim()).filter((s) => s)
                          )
                        }
                        placeholder="e.g., property.plot_no, applicant.full_name"
                        disabled={isOffline || actionLoading}
                      />
                    </Field>
                    <Field label="Unlock Documents (doc type IDs, comma-separated)" htmlFor="unlock-documents">
                      <Input
                        id="unlock-documents"
                        type="text"
                        value={unlockedDocuments.join(", ")}
                        onChange={(e) =>
                          setUnlockedDocuments(
                            e.target.value.split(",").map((s) => s.trim()).filter((s) => s)
                          )
                        }
                        placeholder="e.g., DOC_PAYMENT_RECEIPT"
                        disabled={isOffline || actionLoading}
                      />
                    </Field>
                  </>
                )}
                <Field label="Remarks" htmlFor="action-remarks" required={action === "REJECT"}>
                  <Textarea
                    id="action-remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    disabled={isOffline || actionLoading}
                  />
                </Field>
                <div className="action-form-buttons">
                  <Button
                    onClick={() => void handleAction()}
                    className="submit-action"
                    disabled={
                      isOffline ||
                      actionLoading ||
                      (action === "QUERY" && !queryMessage.trim()) ||
                      (action === "REJECT" && !remarks.trim())
                    }
                  >
                    {actionLoading ? "Submitting..." : `Submit ${action}`}
                  </Button>
                  <Button
                    onClick={() => setAction(null)}
                    className="cancel-action"
                    variant="ghost"
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Modal
        open={confirmOpen && (action === "APPROVE" || action === "REJECT")}
        onClose={() => setConfirmOpen(false)}
        title={action === "APPROVE" ? "Confirm Approval" : "Confirm Rejection"}
        description={
          action === "APPROVE"
            ? "This approval is recorded in the workflow and cannot be auto-undone."
            : "This rejection is recorded in the workflow and cannot be auto-undone."
        }
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={action === "APPROVE" ? "success" : "danger"}
              onClick={() => {
                setConfirmOpen(false);
                void handleAction(true);
              }}
            >
              Confirm {action === "APPROVE" ? "Approval" : "Rejection"}
            </Button>
          </>
        }
      />
    </div>
  );
}
