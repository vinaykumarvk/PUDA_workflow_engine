import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, SkeletonBlock } from "@puda/shared";
import { apiBaseUrl } from "./types";
import "./service-config.css";

// ---- Types ----

interface ServiceSummary {
  serviceKey: string;
  name: string;
  category: string;
  description: string;
}

interface VersionSummary {
  version: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  applicationCount: number;
  isActive: boolean;
}

interface WorkflowState {
  stateId: string;
  label?: string;
  type?: string;
  systemRoleId?: string;
  slaDays?: number;
  [key: string]: unknown;
}

interface WorkflowTransition {
  transitionId: string;
  fromStateId: string;
  toStateId: string;
  action?: string;
  systemRoleId?: string;
  [key: string]: unknown;
}

interface DocumentType {
  docTypeId: string;
  name?: string;
  mandatory?: boolean;
  conditional?: boolean;
  allowedMimeTypes?: string[];
  maxSizeMB?: number;
  [key: string]: unknown;
}

interface FeeSchedule {
  feeType: string;
  amount: number;
  description: string;
}

interface VersionDetail {
  serviceKey: string;
  version: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  displayName: string;
  category: string;
  description: string;
  workflow?: { states?: WorkflowState[]; transitions?: WorkflowTransition[] };
  documents?: { documentTypes?: DocumentType[] };
  feeSchedule?: { default?: FeeSchedule[]; byAuthority?: Record<string, FeeSchedule[]> };
}

interface DiffResult<T> {
  added: T[];
  removed: T[];
  changed: { before: T; after: T }[];
}

interface CompareResult {
  v1: string;
  v2: string;
  workflow: { states: DiffResult<WorkflowState>; transitions: DiffResult<WorkflowTransition> };
  documents: DiffResult<DocumentType>;
}

// ---- Props ----

interface ServiceConfigViewProps {
  authHeaders: () => Record<string, string>;
  isOffline: boolean;
  onBack: () => void;
}

type SubView = "service-list" | "version-list" | "version-detail";
type DetailTab = "workflow" | "documents" | "fees" | "compare";

export default function ServiceConfigView({ authHeaders, isOffline, onBack }: ServiceConfigViewProps) {
  const { t } = useTranslation();
  const [subView, setSubView] = useState<SubView>("service-list");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("workflow");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compare state (version-detail tab)
  const [compareV1, setCompareV1] = useState<string>("");
  const [compareV2, setCompareV2] = useState<string>("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // List-level compare state
  const [listCompareMode, setListCompareMode] = useState(false);
  const [listCompareV1, setListCompareV1] = useState<string>("");
  const [listCompareV2, setListCompareV2] = useState<string>("");
  const [listCompareResult, setListCompareResult] = useState<CompareResult | null>(null);
  const [listCompareLoading, setListCompareLoading] = useState(false);

  // ---- Data loading ----

  const loadServices = useCallback(async () => {
    if (isOffline) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/config/services`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setServices(data.services || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isOffline]);

  const loadVersions = useCallback(async (serviceKey: string) => {
    if (isOffline) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/config/services/${serviceKey}/versions`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isOffline]);

  const loadVersionDetail = useCallback(async (serviceKey: string, version: string) => {
    if (isOffline) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/config/services/${serviceKey}/versions/${version}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setVersionDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load version detail");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isOffline]);

  const loadCompare = useCallback(async () => {
    if (isOffline || !selectedService || !compareV1 || !compareV2) return;
    setCompareLoading(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/config/services/${selectedService}/versions/compare?v1=${compareV1}&v2=${compareV2}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setCompareResult(await res.json());
    } catch (err) {
      setCompareResult(null);
    } finally {
      setCompareLoading(false);
    }
  }, [authHeaders, isOffline, selectedService, compareV1, compareV2]);

  const loadListCompare = useCallback(async () => {
    if (isOffline || !selectedService || !listCompareV1 || !listCompareV2) return;
    setListCompareLoading(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/config/services/${selectedService}/versions/compare?v1=${listCompareV1}&v2=${listCompareV2}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setListCompareResult(await res.json());
    } catch {
      setListCompareResult(null);
    } finally {
      setListCompareLoading(false);
    }
  }, [authHeaders, isOffline, selectedService, listCompareV1, listCompareV2]);

  useEffect(() => { void loadServices(); }, [loadServices]);

  useEffect(() => {
    if (activeTab === "compare" && compareV1 && compareV2) {
      void loadCompare();
    }
  }, [activeTab, compareV1, compareV2, loadCompare]);

  // ---- Navigation handlers ----

  const handleSelectService = (svc: ServiceSummary) => {
    setSelectedService(svc.serviceKey);
    setSelectedServiceName(svc.name);
    setVersions([]);
    setSubView("version-list");
    void loadVersions(svc.serviceKey);
  };

  const handleSelectVersion = (ver: VersionSummary) => {
    setSubView("version-detail");
    setActiveTab("workflow");
    setCompareV1(ver.version);
    setCompareV2("");
    setCompareResult(null);
    void loadVersionDetail(selectedService!, ver.version);
  };

  const handleBackToServices = () => {
    setSubView("service-list");
    setSelectedService(null);
    setVersions([]);
    setVersionDetail(null);
    setListCompareMode(false);
    setListCompareResult(null);
  };

  const handleBackToVersions = () => {
    setSubView("version-list");
    setVersionDetail(null);
  };

  // ---- Render helpers ----

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const stateTypeDotClass = (type?: string): string => {
    switch (type) {
      case "initial": return "wf-step__dot--initial";
      case "task": return "wf-step__dot--task";
      case "auto": return "wf-step__dot--auto";
      case "terminal": return "wf-step__dot--terminal";
      default: return "";
    }
  };

  // ---- Sub-view: Service list ----

  const renderServiceList = () => (
    <>
      <Button className="svc-back-btn" variant="ghost" type="button" onClick={onBack}>&larr; {t("svc.back_to_workbench")}</Button>
      <h2 style={{ margin: `0 0 var(--space-4) 0`, fontSize: "clamp(1.1rem, 2.5vw, 1.4rem)" }}>{t("svc.configurations_heading")}</h2>
      {loading ? (
        <div className="svc-grid">
          {[1,2,3,4].map(i => <SkeletonBlock key={i} height="6rem" />)}
        </div>
      ) : services.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <h3>{t("svc.no_services")}</h3>
          <p>{t("svc.no_services_desc")}</p>
        </div>
      ) : (
        <div className="svc-grid">
          {services.map(svc => (
            <div
              key={svc.serviceKey}
              className="svc-card"
              role="button"
              tabIndex={0}
              aria-label={`View ${svc.name}`}
              onClick={() => handleSelectService(svc)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectService(svc); } }}
            >
              <p className="svc-card__category">{svc.category}</p>
              <p className="svc-card__name">{svc.name}</p>
              <p className="svc-card__desc">{svc.description}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ---- Sub-view: Version timeline ----

  const renderVersionList = () => (
    <>
      <Button className="svc-back-btn" variant="ghost" type="button" onClick={handleBackToServices}>&larr; {t("svc.all_services")}</Button>
      <h2 style={{ margin: `0 0 var(--space-4) 0`, fontSize: "clamp(1.1rem, 2.5vw, 1.4rem)" }}>
        {t("svc.versions_heading", { name: selectedServiceName })}
      </h2>

      {versions.length >= 2 && (
        <div style={{ marginBottom: `var(--space-4)` }}>
          <Button
            variant={listCompareMode ? "primary" : "ghost"}
            type="button"
            onClick={() => { setListCompareMode(m => !m); setListCompareResult(null); }}
          >
            {listCompareMode ? t("svc.hide_compare") : t("svc.compare_versions")}
          </Button>

          {listCompareMode && (
            <>
              <div className="compare-selectors" style={{ marginTop: `var(--space-3)` }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "var(--space-1)" }}>
                    {t("svc.version_a")}
                  </label>
                  <select
                    value={listCompareV1}
                    onChange={e => { setListCompareV1(e.target.value); setListCompareResult(null); }}
                  >
                    <option value="">{t("svc.select")}</option>
                    {versions.map(v => (
                      <option key={v.version} value={v.version}>v{v.version}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "var(--space-1)" }}>
                    {t("svc.version_b")}
                  </label>
                  <select
                    value={listCompareV2}
                    onChange={e => { setListCompareV2(e.target.value); setListCompareResult(null); }}
                  >
                    <option value="">{t("svc.select")}</option>
                    {versions.map(v => (
                      <option key={v.version} value={v.version}>v{v.version}</option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="primary"
                  type="button"
                  disabled={!listCompareV1 || !listCompareV2 || listCompareV1 === listCompareV2 || listCompareLoading}
                  onClick={() => void loadListCompare()}
                >
                  {t("svc.compare")}
                </Button>
              </div>

              {listCompareLoading && <SkeletonBlock height="8rem" />}
              {listCompareResult && renderDiff(listCompareResult)}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="ver-timeline">
          {[1,2].map(i => <SkeletonBlock key={i} height="5rem" />)}
        </div>
      ) : versions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <h3>{t("svc.no_versions")}</h3>
          <p>{t("svc.no_versions_desc")}</p>
        </div>
      ) : (
        <div className="ver-timeline">
          {versions.map(ver => (
            <div
              key={ver.version}
              className={`ver-item ${ver.isActive ? "ver-item--active" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Version ${ver.version}`}
              onClick={() => handleSelectVersion(ver)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectVersion(ver); } }}
            >
              <div className="ver-item__header">
                <span className="ver-item__version">v{ver.version}</span>
                {ver.isActive && <span className="ver-item__badge ver-item__badge--active">Active</span>}
                <span className={`ver-item__badge ver-item__badge--${ver.status === "published" ? "published" : "draft"}`}>
                  {ver.status}
                </span>
              </div>
              <div className="ver-item__meta">
                <span>Effective: {formatDate(ver.effectiveFrom)} — {formatDate(ver.effectiveTo)}</span>
                <span>{ver.applicationCount} application{ver.applicationCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ---- Sub-view: Version detail — Workflow tab ----

  const renderWorkflowTab = () => {
    if (!versionDetail?.workflow) return <p className="svc-empty">{t("svc.no_workflow")}</p>;
    const { states = [], transitions = [] } = versionDetail.workflow;

    // Build adjacency map: stateId → outgoing transitions
    const stateMap = new Map(states.map(s => [s.stateId, s]));
    const transFromMap = new Map<string, WorkflowTransition[]>();
    for (const t of transitions) {
      const arr = transFromMap.get(t.fromStateId) || [];
      arr.push(t);
      transFromMap.set(t.fromStateId, arr);
    }

    // Classify transitions from a state
    const getBranches = (stateId: string) => {
      const outgoing = transFromMap.get(stateId) || [];
      return {
        query: outgoing.find(t => t.toStateId.includes("QUERY_PENDING")),
        reject: outgoing.find(t => t.toStateId.includes("REJECTED")),
      };
    };

    // Walk happy path using "forward" transitions (skip REJECTED / QUERY_PENDING targets)
    const initialState = states.find(s => s.type === "initial");
    const happyPath: WorkflowState[] = [];
    const visited = new Set<string>();
    let current = initialState?.stateId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const st = stateMap.get(current);
      if (st) happyPath.push(st);
      const outgoing = transFromMap.get(current);
      if (!outgoing?.length) break;
      const forward = outgoing.find(t =>
        !t.toStateId.includes("REJECTED") && !t.toStateId.includes("QUERY_PENDING")
      );
      current = forward?.toStateId ?? outgoing[0]?.toStateId;
    }

    // Detect query loop: QUERY_PENDING → RESUBMITTED → first TASK state
    const queryState = states.find(s => s.stateId.includes("QUERY_PENDING"));
    const resubmittedState = states.find(s => s.stateId.includes("RESUBMITTED"));
    const firstTaskState = happyPath.find(s => s.type === "task");

    return (
      <>
        <h3 style={{ margin: `0 0 var(--space-3) 0`, fontSize: "1rem" }}>{t("svc.workflow_flow")}</h3>
        <div className="wf-flow">
          {happyPath.map((state, idx) => {
            const branches = state.type === "task" ? getBranches(state.stateId) : null;
            return (
              <div key={state.stateId} className="wf-step">
                <div className="wf-step__connector">
                  <div className={`wf-step__dot ${stateTypeDotClass(state.type)}`} />
                  {idx < happyPath.length - 1 && <div className="wf-step__line" />}
                </div>
                <div className="wf-step__body">
                  <span className="wf-step__label">{state.label || state.stateId}</span>
                  <div className="wf-step__meta">
                    {state.type && <span className="wf-step__chip">{state.type}</span>}
                    {state.systemRoleId && <span className="wf-step__chip">{state.systemRoleId}</span>}
                    {state.slaDays != null && <span className="wf-step__chip">SLA: {state.slaDays}d</span>}
                  </div>
                  {branches && (branches.query || branches.reject) && (
                    <div className="wf-step__branches">
                      {branches.query && <span className="wf-branch-chip wf-branch-chip--query">→ Query</span>}
                      {branches.reject && <span className="wf-branch-chip wf-branch-chip--reject">→ Reject</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {queryState && resubmittedState && firstTaskState && (
          <div className="wf-query-loop">
            <strong>{t("svc.query_loop")}</strong>{" "}
            {queryState.label || queryState.stateId} → {resubmittedState.label || resubmittedState.stateId} → {firstTaskState.label || firstTaskState.stateId}
          </div>
        )}

        <h3 style={{ margin: `var(--space-5) 0 var(--space-3) 0`, fontSize: "1rem" }}>{t("svc.all_transitions")}</h3>
        {transitions.length === 0 ? (
          <p className="svc-empty">{t("svc.no_transitions")}</p>
        ) : (
          <table className="wf-transition-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>From</th>
                <th>To</th>
                <th>Action</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map(t => (
                <tr key={t.transitionId}>
                  <td data-label="ID">{t.transitionId}</td>
                  <td data-label="From">{t.fromStateId}</td>
                  <td data-label="To">{t.toStateId}</td>
                  <td data-label="Action">{t.action || "—"}</td>
                  <td data-label="Role">{t.systemRoleId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  };

  // ---- Sub-view: Version detail — Documents tab ----

  const renderDocumentsTab = () => {
    const docs = versionDetail?.documents?.documentTypes || [];
    if (docs.length === 0) return <p className="svc-empty">{t("svc.no_documents")}</p>;

    return (
      <div className="doc-type-list">
        {docs.map(doc => (
          <div key={doc.docTypeId} className="doc-type-card">
            <p className="doc-type-card__name">{doc.name || doc.docTypeId}</p>
            <div className="doc-type-card__meta">
              {doc.mandatory ? (
                <span className="doc-type-card__badge doc-type-card__badge--mandatory">Mandatory</span>
              ) : doc.conditional ? (
                <span className="doc-type-card__badge doc-type-card__badge--conditional">Conditional</span>
              ) : (
                <span className="doc-type-card__badge doc-type-card__badge--optional">Optional</span>
              )}
              {doc.allowedMimeTypes && (
                <span>{doc.allowedMimeTypes.join(", ")}</span>
              )}
              {doc.maxSizeMB != null && <span>Max: {doc.maxSizeMB} MB</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ---- Sub-view: Version detail — Fees tab ----

  const renderFeeTable = (fees: FeeSchedule[]) => (
    <table className="wf-transition-table">
      <thead>
        <tr>
          <th>Fee Type</th>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {fees.map((fee, i) => (
          <tr key={i}>
            <td data-label="Fee Type">{fee.feeType}</td>
            <td data-label="Description">{fee.description}</td>
            <td data-label="Amount">₹{fee.amount.toLocaleString("en-IN")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderFeesTab = () => {
    const schedule = versionDetail?.feeSchedule;
    const defaultFees = schedule?.default || [];
    const byAuthority = schedule?.byAuthority;

    if (defaultFees.length === 0 && !byAuthority) {
      return <p className="svc-empty">{t("svc.no_fees")}</p>;
    }

    return (
      <>
        {defaultFees.length > 0 && (
          <>
            <h3 style={{ margin: `0 0 var(--space-3) 0`, fontSize: "1rem" }}>{t("svc.default_fees")}</h3>
            {renderFeeTable(defaultFees)}
          </>
        )}
        {byAuthority && Object.entries(byAuthority).map(([authority, fees]) => (
          <div key={authority} style={{ marginTop: `var(--space-4)` }}>
            <h3 style={{ margin: `0 0 var(--space-3) 0`, fontSize: "1rem" }}>{authority}</h3>
            {renderFeeTable(fees)}
          </div>
        ))}
      </>
    );
  };

  // ---- Sub-view: Version detail — Compare tab ----

  const renderCompareTab = () => {
    const otherVersions = versions.filter(v => v.version !== versionDetail?.version);

    return (
      <>
        <div className="compare-selectors">
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "var(--space-1)" }}>
              {t("svc.base_current")}
            </label>
            <select value={compareV1} disabled>
              <option value={compareV1}>v{compareV1}</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "var(--space-1)" }}>
              {t("svc.compare_with")}
            </label>
            <select
              value={compareV2}
              onChange={e => { setCompareV2(e.target.value); setCompareResult(null); }}
            >
              <option value="">{t("svc.select_version")}</option>
              {otherVersions.map(v => (
                <option key={v.version} value={v.version}>v{v.version}</option>
              ))}
            </select>
          </div>
        </div>

        {compareLoading && <SkeletonBlock height="8rem" />}
        {!compareV2 && !compareLoading && (
          <p className="svc-empty">{t("svc.select_version_compare")}</p>
        )}
        {compareResult && renderDiff(compareResult)}
      </>
    );
  };

  const renderDiffSection = <T extends Record<string, unknown>>(
    title: string,
    diff: DiffResult<T>,
    labelFn: (item: T) => string
  ) => {
    const isEmpty = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
    return (
      <div className="diff-section">
        <p className="diff-section__title">{title}</p>
        {isEmpty ? (
          <p className="diff-empty">{t("svc.no_changes")}</p>
        ) : (
          <div className="diff-list">
            {diff.added.map((item, i) => (
              <div key={`a-${i}`} className="diff-item diff-added">+ {labelFn(item)}</div>
            ))}
            {diff.removed.map((item, i) => (
              <div key={`r-${i}`} className="diff-item diff-removed">− {labelFn(item)}</div>
            ))}
            {diff.changed.map((c, i) => (
              <div key={`c-${i}`} className="diff-item diff-changed">~ {labelFn(c.before)} → {labelFn(c.after)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderDiff = (result: CompareResult) => (
    <>
      {renderDiffSection("Workflow States", result.workflow.states, s => s.label || s.stateId)}
      {renderDiffSection("Workflow Transitions", result.workflow.transitions, t => `${t.fromStateId} → ${t.toStateId} (${t.transitionId})`)}
      {renderDiffSection("Document Types", result.documents, d => d.name || d.docTypeId)}
    </>
  );

  // ---- Sub-view: Version detail (top-level) ----

  const renderVersionDetail = () => {
    if (!versionDetail && loading) {
      return <SkeletonBlock height="20rem" />;
    }
    if (!versionDetail) return <p className="svc-empty">{t("svc.version_not_found")}</p>;

    return (
      <>
        <Button className="svc-back-btn" variant="ghost" type="button" onClick={handleBackToVersions}>
          &larr; {selectedServiceName} Versions
        </Button>
        <div className="ver-detail-header">
          <h2>{versionDetail.displayName || selectedServiceName} v{versionDetail.version}</h2>
          <span className={`ver-item__badge ver-item__badge--${versionDetail.status === "published" ? "published" : "draft"}`}>
            {versionDetail.status}
          </span>
        </div>

        <nav className="svc-tabs" aria-label="Version detail tabs">
          {(["workflow", "documents", "fees", "compare"] as DetailTab[]).map(tab => (
            <button
              key={tab}
              className={`svc-tab ${activeTab === tab ? "svc-tab--active" : ""}`}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
            >
              {t(`svc.tab_${tab}`)}
            </button>
          ))}
        </nav>

        {activeTab === "workflow" && renderWorkflowTab()}
        {activeTab === "documents" && renderDocumentsTab()}
        {activeTab === "fees" && renderFeesTab()}
        {activeTab === "compare" && renderCompareTab()}
      </>
    );
  };

  // ---- Main render ----

  return (
    <>
      {error && <Alert variant="error" className="view-feedback">{error}</Alert>}

      {subView === "service-list" && renderServiceList()}
      {subView === "version-list" && renderVersionList()}
      {subView === "version-detail" && renderVersionDetail()}
    </>
  );
}
