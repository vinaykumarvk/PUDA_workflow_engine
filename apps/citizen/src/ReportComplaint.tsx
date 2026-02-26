import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Alert, Button, Card, Field, Input, Select, SkeletonBlock, validatePincode, PUNJAB_DISTRICTS } from "@puda/shared";
import { Bilingual } from "./Bilingual";
import "./report-complaint.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type SubView = "list" | "create" | "detail";

interface Complaint {
  complaint_id: string;
  complaint_number: string;
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
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at: string;
}

interface ReportComplaintProps {
  onBack: () => void;
  isOffline: boolean;
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

const STATUS_FILTERS = [
  "ALL",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INSPECTION_ORDERED",
  "ACTION_TAKEN",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
] as const;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getViolationTypeKey(type: string): string {
  const map: Record<string, string> = {
    UNAUTHORIZED_CONSTRUCTION: "complaints.type_unauthorized_construction",
    PLAN_DEVIATION: "complaints.type_plan_deviation",
    ENCROACHMENT: "complaints.type_encroachment",
    HEIGHT_VIOLATION: "complaints.type_height_violation",
    SETBACK_VIOLATION: "complaints.type_setback_violation",
    CHANGE_OF_USE: "complaints.type_change_of_use",
    UNAUTHORIZED_COLONY: "complaints.type_unauthorized_colony",
    OTHER: "complaints.type_other",
  };
  return map[type] || "complaints.type_other";
}

function getStatusKey(status: string): string {
  const map: Record<string, string> = {
    SUBMITTED: "complaints.status_submitted",
    UNDER_REVIEW: "complaints.status_under_review",
    INSPECTION_ORDERED: "complaints.status_inspection_ordered",
    ACTION_TAKEN: "complaints.status_action_taken",
    RESOLVED: "complaints.status_resolved",
    CLOSED: "complaints.status_closed",
    REJECTED: "complaints.status_rejected",
  };
  return map[status] || status;
}

function getStatusBadgeClass(status: string): string {
  return `complaint-status-badge complaint-status-badge--${status.toLowerCase()}`;
}

export default function ReportComplaint({ onBack, isOffline }: ReportComplaintProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [subView, setSubView] = useState<SubView>("list");
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    violationType: "",
    subject: "",
    description: "",
    locationAddress: "",
    locationLocality: "",
    locationCity: "Mohali",
    locationDistrict: "SAS Nagar",
    locationPincode: "",
  });
  const [filing, setFiling] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Evidence upload state
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiFilled, setAiFilled] = useState(false);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggleVoiceInput = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language?.startsWith("hi") ? "hi-IN" : "en-IN";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        setFormData((p) => ({
          ...p,
          description: p.description ? p.description + " " + transcript : transcript,
        }));
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Trigger AI parse if transcript is long enough
      setFormData((prev) => {
        if (prev.description && prev.description.length > 20) {
          parseWithAI(prev.description);
        }
        return prev;
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const parseWithAI = useCallback(async (transcript: string) => {
    setAiParsing(true);
    try {
      const lang = navigator.language?.startsWith("hi") ? "hi" : navigator.language?.startsWith("pa") ? "pa" : "en";
      const res = await fetch(`${apiBaseUrl}/api/v1/ai/parse-complaint`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, language: lang }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.confidence > 0.3) {
        setFormData((prev) => ({
          ...prev,
          violationType: data.violationType || prev.violationType,
          subject: data.subject || prev.subject,
          description: data.description || prev.description,
          locationLocality: data.locationLocality || prev.locationLocality,
          locationCity: data.locationCity || prev.locationCity,
        }));
        setAiFilled(true);
      }
    } catch {
      // Non-blocking: AI parse failure doesn't affect form
    } finally {
      setAiParsing(false);
    }
  }, [authHeaders]);

  const loadComplaints = useCallback(async () => {
    if (isOffline || !token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "ALL") qs.set("status", statusFilter);
      const res = await fetch(`${apiBaseUrl}/api/v1/complaints?${qs}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setComplaints(data.complaints || []);
      setTotal(data.total || 0);
    } catch {
      setError(t("complaints.failed_load"));
    } finally {
      setLoading(false);
    }
  }, [token, isOffline, statusFilter, authHeaders, t]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const loadComplaintDetail = useCallback(
    async (complaintNumber: string) => {
      if (!token) return;
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/v1/complaints/${encodeURIComponent(complaintNumber)}`,
          { headers: authHeaders() }
        );
        if (!res.ok) throw new Error("Failed to load");
        const data: Complaint = await res.json();
        setSelectedComplaint(data);
        setSubView("detail");
      } catch {
        setError(t("complaints.failed_load"));
      }
    },
    [token, authHeaders, t]
  );

  const handleSubmitComplaint = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isOffline || !token) return;

      // Submit-time validation guard
      const submitErrors: Record<string, string> = {};
      if (!formData.violationType) submitErrors.violationType = "complaints.violation_required";
      if (!formData.subject?.trim()) submitErrors.subject = "complaints.subject_required";
      if (!formData.description?.trim()) submitErrors.description = "complaints.description_required";
      if (!formData.locationAddress?.trim()) submitErrors.locationAddress = "complaints.address_required";
      if (formData.locationPincode) {
        const pinErr = validatePincode(formData.locationPincode);
        if (pinErr) submitErrors.pincode = pinErr;
      }
      if (Object.keys(submitErrors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...submitErrors }));
        return;
      }

      setFiling(true);
      setFormError(null);
      setSuccessMsg(null);
      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/complaints`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            violationType: formData.violationType,
            subject: formData.subject,
            description: formData.description,
            locationAddress: formData.locationAddress,
            locationLocality: formData.locationLocality || undefined,
            locationCity: formData.locationCity || undefined,
            locationDistrict: formData.locationDistrict || undefined,
            locationPincode: formData.locationPincode || undefined,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Failed");
        }
        const complaint: Complaint = await res.json();
        setSuccessMsg(
          t("complaints.filed_success", { number: complaint.complaint_number })
        );
        setFormData({
          violationType: "",
          subject: "",
          description: "",
          locationAddress: "",
          locationLocality: "",
          locationCity: "Mohali",
          locationDistrict: "SAS Nagar",
          locationPincode: "",
        });
        // Switch to detail of newly created complaint
        setSelectedComplaint(complaint);
        setSubView("detail");
        // Refresh list in background
        loadComplaints();
      } catch (err: any) {
        setFormError(err.message || t("complaints.filed_error"));
      } finally {
        setFiling(false);
      }
    },
    [isOffline, token, formData, authHeaders, t, loadComplaints]
  );

  const handleUploadEvidence = useCallback(
    async (file: File) => {
      if (!selectedComplaint || !token) return;
      setEvidenceUploading(true);
      setEvidenceError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(
          `${apiBaseUrl}/api/v1/complaints/${encodeURIComponent(selectedComplaint.complaint_number)}/evidence`,
          {
            method: "POST",
            headers: authHeaders(),
            body: fd,
          }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Upload failed");
        }
        // Reload detail to get updated evidence list
        await loadComplaintDetail(selectedComplaint.complaint_number);
      } catch (err: any) {
        setEvidenceError(err.message || t("complaints.evidence_failed"));
      } finally {
        setEvidenceUploading(false);
      }
    },
    [selectedComplaint, token, authHeaders, loadComplaintDetail, t]
  );

  // Filter complaints locally by search
  const filteredComplaints = complaints.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.complaint_number.toLowerCase().includes(q) ||
      c.subject.toLowerCase().includes(q) ||
      c.location_address.toLowerCase().includes(q) ||
      (c.location_locality && c.location_locality.toLowerCase().includes(q))
    );
  });

  // ─── List View ───
  if (subView === "list") {
    return (
      <div className="complaint-page">
        {successMsg && (
          <Alert variant="success" role="status">
            {successMsg}
          </Alert>
        )}

        <div className="complaint-toolbar">
          <Button variant="primary" onClick={() => { setSuccessMsg(null); setFormError(null); setSubView("create"); }} disabled={isOffline}>
            {t("complaints.new")}
          </Button>
          <input
            type="search"
            className="input search-input"
            placeholder={t("complaints.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="complaint-filters">
          {STATUS_FILTERS.map((sf) => (
            <button
              key={sf}
              type="button"
              className={`complaint-filter-chip ${statusFilter === sf ? "complaint-filter-chip--active" : ""}`}
              aria-pressed={statusFilter === sf}
              onClick={() => setStatusFilter(sf)}
            >
              {sf === "ALL"
                ? t("complaints.filter_all")
                : t(getStatusKey(sf))}
            </button>
          ))}
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <SkeletonBlock height="5rem" />
            <SkeletonBlock height="5rem" />
            <SkeletonBlock height="5rem" />
          </div>
        ) : filteredComplaints.length === 0 ? (
          <Card>
            <div className="complaint-empty">
              <div className="complaint-empty-icon">
                <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <h3><Bilingual tKey="complaints.empty_title" /></h3>
              <p>{t("complaints.empty_desc")}</p>
            </div>
          </Card>
        ) : (
          <div className="complaint-list">
            {filteredComplaints.map((c) => (
              <Card
                key={c.complaint_id}
                className="complaint-card"
                onClick={() => loadComplaintDetail(c.complaint_number)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadComplaintDetail(c.complaint_number);
                  }
                }}
              >
                <div className="complaint-card-header">
                  <div>
                    <div className="complaint-card-number">{c.complaint_number}</div>
                    <div className="complaint-card-subject">{c.subject}</div>
                  </div>
                  <span className={getStatusBadgeClass(c.status)}>
                    {t(getStatusKey(c.status))}
                  </span>
                </div>
                <div className="complaint-card-meta">
                  <span className="complaint-type-badge">
                    {t(getViolationTypeKey(c.violation_type))}
                  </span>
                  <span>{c.location_address}</span>
                  <span>{formatDate(c.created_at)}</span>
                  {c.evidence_count != null && c.evidence_count > 0 && (
                    <span>{t("complaints.evidence_count", { count: c.evidence_count })}</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Create View ───
  if (subView === "create") {
    return (
      <div className="complaint-page">
        <Button
          variant="ghost"
          onClick={() => setSubView("list")}
          style={{ alignSelf: "flex-start" }}
        >
          &larr; {t("complaints.back_to_list")}
        </Button>

        {formError && <Alert variant="error">{formError}</Alert>}

        <Card>
          <form className="complaint-form" onSubmit={handleSubmitComplaint}>
            <Field label={<Bilingual tKey="complaints.violation_type" />} required htmlFor="violation-type">
              <Select
                id="violation-type"
                value={formData.violationType}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, violationType: e.target.value }))
                }
                required
              >
                <option value="">{t("complaints.select_type")}</option>
                {VIOLATION_TYPES.map((vt) => (
                  <option key={vt} value={vt}>
                    {t(getViolationTypeKey(vt))}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={<Bilingual tKey="complaints.subject" />} required htmlFor="subject">
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, subject: e.target.value }))
                }
                placeholder={t("complaints.subject_placeholder")}
                maxLength={200}
                required
              />
            </Field>

            <Field label={<Bilingual tKey="complaints.description" />} required htmlFor="description">
              <div className="voice-input-wrap">
                <textarea
                  id="description"
                  className="input"
                  rows={5}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder={t("complaints.description_placeholder")}
                  maxLength={2000}
                  required
                  style={{ resize: "vertical" }}
                />
                {speechSupported && (
                  <button
                    type="button"
                    className={`voice-input-btn${isListening ? " voice-input-btn--listening" : ""}`}
                    onClick={toggleVoiceInput}
                    aria-label={isListening ? t("complaints.voice_listening") : t("complaints.voice_input")}
                    title={isListening ? t("complaints.voice_listening") : t("complaints.voice_input")}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                    {isListening && <span className="voice-input-btn__pulse" />}
                  </button>
                )}
              </div>
              {isListening && (
                <p className="voice-input-hint">{t("complaints.voice_listening")}</p>
              )}
              {aiParsing && (
                <p className="voice-input-hint" style={{ color: "var(--color-brand)" }}>{t("complaints.ai_parsing")}</p>
              )}
              {aiFilled && !aiParsing && (
                <p className="voice-input-hint" style={{ color: "var(--color-success)" }}>{t("complaints.ai_filled")}</p>
              )}
            </Field>

            <Field label={<Bilingual tKey="complaints.location_address" />} required htmlFor="location-address">
              <Input
                id="location-address"
                value={formData.locationAddress}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, locationAddress: e.target.value }))
                }
                placeholder={t("complaints.address_placeholder")}
                required
              />
            </Field>

            <div className="complaint-form-grid">
              <Field label={<Bilingual tKey="complaints.location_locality" />} htmlFor="locality">
                <Input
                  id="locality"
                  value={formData.locationLocality}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, locationLocality: e.target.value }))
                  }
                  placeholder={t("complaints.locality_placeholder")}
                />
              </Field>
              <Field label={<Bilingual tKey="complaints.location_pincode" />} htmlFor="pincode" error={fieldErrors.pincode ? t(fieldErrors.pincode) : undefined}>
                <Input
                  id="pincode"
                  value={formData.locationPincode}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, locationPincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                  }
                  onBlur={() => {
                    const err = validatePincode(formData.locationPincode);
                    setFieldErrors((prev) => {
                      if (err) return { ...prev, pincode: err };
                      const { pincode: _, ...rest } = prev;
                      return rest;
                    });
                  }}
                  placeholder={t("complaints.pincode_placeholder")}
                  inputMode="numeric"
                  maxLength={6}
                />
              </Field>
            </div>

            <div className="complaint-form-grid">
              <Field label={<Bilingual tKey="complaints.location_city" />} htmlFor="city">
                <Input
                  id="city"
                  value={formData.locationCity}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, locationCity: e.target.value }))
                  }
                />
              </Field>
              <Field label={<Bilingual tKey="complaints.location_district" />} htmlFor="district">
                <Select
                  id="district"
                  value={formData.locationDistrict}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, locationDistrict: e.target.value }))
                  }
                >
                  <option value="">{t("profile.select")}</option>
                  {PUNJAB_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
            </div>

            <div className="complaint-form-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setSubView("list")}
              >
                {t("complaints.cancel")}
              </Button>
              <Button variant="primary" type="submit" disabled={filing || isOffline}>
                {filing ? t("complaints.filing") : t("complaints.submit")}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // ─── Detail View ───
  if (subView === "detail" && selectedComplaint) {
    const c = selectedComplaint;
    return (
      <div className="complaint-page">
        {successMsg && (
          <Alert variant="success" role="status">
            {successMsg}
          </Alert>
        )}

        <Button
          variant="ghost"
          onClick={() => {
            setSuccessMsg(null);
            setSelectedComplaint(null);
            setSubView("list");
          }}
          style={{ alignSelf: "flex-start" }}
        >
          &larr; {t("complaints.back_to_list")}
        </Button>

        <Card>
          <div className="complaint-detail">
            <div className="complaint-detail-grid">
              <div className="complaint-detail-field">
                <span className="complaint-detail-label"><Bilingual tKey="complaints.complaint_number" /></span>
                <span className="complaint-detail-value" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  {c.complaint_number}
                </span>
              </div>
              <div className="complaint-detail-field">
                <span className="complaint-detail-label"><Bilingual tKey="complaints.current_status" /></span>
                <span className={getStatusBadgeClass(c.status)} style={{ alignSelf: "flex-start" }}>
                  {t(getStatusKey(c.status))}
                </span>
              </div>
              <div className="complaint-detail-field">
                <span className="complaint-detail-label"><Bilingual tKey="complaints.violation_type" /></span>
                <span className="complaint-detail-value">{t(getViolationTypeKey(c.violation_type))}</span>
              </div>
              <div className="complaint-detail-field">
                <span className="complaint-detail-label"><Bilingual tKey="complaints.date_filed" /></span>
                <span className="complaint-detail-value">{formatDate(c.created_at)}</span>
              </div>
            </div>

            <div className="complaint-detail-field">
              <span className="complaint-detail-label"><Bilingual tKey="complaints.subject" /></span>
              <span className="complaint-detail-value">{c.subject}</span>
            </div>

            <div className="complaint-detail-field">
              <span className="complaint-detail-label"><Bilingual tKey="complaints.description" /></span>
              <span className="complaint-detail-value" style={{ whiteSpace: "pre-wrap" }}>{c.description}</span>
            </div>

            <div className="complaint-detail-field">
              <span className="complaint-detail-label"><Bilingual tKey="complaints.location" /></span>
              <span className="complaint-detail-value">
                {c.location_address}
                {c.location_locality && `, ${c.location_locality}`}
                {`, ${c.location_city}, ${c.location_district}`}
                {c.location_pincode && ` - ${c.location_pincode}`}
              </span>
            </div>

            {c.officer_remarks && (
              <div className="complaint-detail-field">
                <span className="complaint-detail-label"><Bilingual tKey="complaints.officer_remarks" /></span>
                <span className="complaint-detail-value" style={{ whiteSpace: "pre-wrap" }}>{c.officer_remarks}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Evidence Section */}
        <Card>
          <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "1rem" }}><Bilingual tKey="complaints.evidence" /></h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0 0 var(--space-3)" }}>
            {t("complaints.evidence_hint")}
          </p>

          {evidenceError && <Alert variant="error" style={{ marginBottom: "var(--space-3)" }}>{evidenceError}</Alert>}

          {c.evidence && c.evidence.length > 0 && (
            <div className="complaint-evidence-grid">
              {c.evidence.map((ev) => (
                <a
                  key={ev.evidence_id}
                  href={`${apiBaseUrl}/api/v1/complaints/${encodeURIComponent(c.complaint_number)}/evidence/${ev.evidence_id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="complaint-evidence-thumb"
                  title={ev.original_filename || "Evidence"}
                >
                  <img
                    src={`${apiBaseUrl}/api/v1/complaints/${encodeURIComponent(c.complaint_number)}/evidence/${ev.evidence_id}/file`}
                    alt={ev.original_filename || "Evidence photo"}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}

          {(!c.evidence || c.evidence.length < 5) && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <label className="btn btn--outline" style={{ cursor: "pointer", display: "inline-block" }}>
                {evidenceUploading ? t("complaints.evidence_uploading") : t("complaints.evidence_upload")}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: "none" }}
                  disabled={evidenceUploading || isOffline}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadEvidence(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {c.evidence && (
                <span style={{ marginLeft: "var(--space-2)", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {t("complaints.evidence_count", { count: c.evidence.length })}
                </span>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return null;
}
