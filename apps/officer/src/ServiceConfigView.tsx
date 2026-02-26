import { useState, useEffect, useCallback } from "react";
import { Alert, Button, SkeletonBlock } from "@puda/shared";
import { apiBaseUrl } from "./types";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./theme";
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
  fromState: string;
  toState: string;
  action?: string;
  systemRoleId?: string;
  [key: string]: unknown;
}

interface DocumentType {
  docTypeId: string;
  label?: string;
  mandatory?: boolean;
  conditional?: boolean;
  acceptedMimeTypes?: string[];
  maxSizeBytes?: number;
  [key: string]: unknown;
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
type DetailTab = "workflow" | "documents" | "compare";

export default function ServiceConfigView({ authHeaders, isOffline, onBack }: ServiceConfigViewProps) {
  const { theme, resolvedTheme, setTheme } = useTheme("puda_officer_theme");

  const [subView, setSubView] = useState<SubView>("service-list");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("workflow");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compare state
  const [compareV1, setCompareV1] = useState<string>("");
  const [compareV2, setCompareV2] = useState<string>("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

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
      <Button className="svc-back-btn" variant="ghost" type="button" onClick={onBack}>&larr; Back to Workbench</Button>
      <h2 style={{ margin: `0 0 var(--space-4) 0`, fontSize: "clamp(1.1rem, 2.5vw, 1.4rem)" }}>Service Configurations</h2>
      {loading ? (
        <div className="svc-grid">
          {[1,2,3,4].map(i => <SkeletonBlock key={i} height="6rem" />)}
        </div>
      ) : services.length === 0 ? (
        <p className="svc-empty">No services configured.</p>
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
      <Button className="svc-back-btn" variant="ghost" type="button" onClick={handleBackToServices}>&larr; All Services</Button>
      <h2 style={{ margin: `0 0 var(--space-4) 0`, fontSize: "clamp(1.1rem, 2.5vw, 1.4rem)" }}>
        {selectedServiceName} — Versions
      </h2>
      {loading ? (
        <div className="ver-timeline">
          {[1,2].map(i => <SkeletonBlock key={i} height="5rem" />)}
        </div>
      ) : versions.length === 0 ? (
        <p className="svc-empty">No versions found.</p>
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
    if (!versionDetail?.workflow) return <p className="svc-empty">No workflow configured.</p>;
    const { states = [], transitions = [] } = versionDetail.workflow;

    // Build happy path: find initial state and follow transitions
    const stateMap = new Map(states.map(s => [s.stateId, s]));
    const transFromMap = new Map<string, WorkflowTransition[]>();
    for (const t of transitions) {
      const arr = transFromMap.get(t.fromState) || [];
      arr.push(t);
      transFromMap.set(t.fromState, arr);
    }

    // Walk from initial state
    const initialState = states.find(s => s.type === "initial");
    const happyPath: WorkflowState[] = [];
    const visited = new Set<string>();
    let current = initialState?.stateId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const st = stateMap.get(current);
      if (st) happyPath.push(st);
      const outgoing = transFromMap.get(current);
      current = outgoing?.[0]?.toState;
    }

    return (
      <>
        <h3 style={{ margin: `0 0 var(--space-3) 0`, fontSize: "1rem" }}>Workflow Flow</h3>
        <div className="wf-flow">
          {happyPath.map((state, idx) => (
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
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ margin: `var(--space-5) 0 var(--space-3) 0`, fontSize: "1rem" }}>All Transitions</h3>
        {transitions.length === 0 ? (
          <p className="svc-empty">No transitions defined.</p>
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
                  <td data-label="From">{t.fromState}</td>
                  <td data-label="To">{t.toState}</td>
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
    if (docs.length === 0) return <p className="svc-empty">No document types configured.</p>;

    const formatSize = (bytes?: number) => {
      if (!bytes) return null;
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
      return `${(bytes / 1024).toFixed(0)} KB`;
    };

    return (
      <div className="doc-type-list">
        {docs.map(doc => (
          <div key={doc.docTypeId} className="doc-type-card">
            <p className="doc-type-card__name">{doc.label || doc.docTypeId}</p>
            <div className="doc-type-card__meta">
              {doc.mandatory ? (
                <span className="doc-type-card__badge doc-type-card__badge--mandatory">Mandatory</span>
              ) : doc.conditional ? (
                <span className="doc-type-card__badge doc-type-card__badge--conditional">Conditional</span>
              ) : (
                <span className="doc-type-card__badge doc-type-card__badge--optional">Optional</span>
              )}
              {doc.acceptedMimeTypes && (
                <span>{doc.acceptedMimeTypes.join(", ")}</span>
              )}
              {formatSize(doc.maxSizeBytes) && <span>Max: {formatSize(doc.maxSizeBytes)}</span>}
            </div>
          </div>
        ))}
      </div>
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
              Base (current)
            </label>
            <select value={compareV1} disabled>
              <option value={compareV1}>v{compareV1}</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "var(--space-1)" }}>
              Compare with
            </label>
            <select
              value={compareV2}
              onChange={e => { setCompareV2(e.target.value); setCompareResult(null); }}
            >
              <option value="">Select version...</option>
              {otherVersions.map(v => (
                <option key={v.version} value={v.version}>v{v.version}</option>
              ))}
            </select>
          </div>
        </div>

        {compareLoading && <SkeletonBlock height="8rem" />}
        {!compareV2 && !compareLoading && (
          <p className="svc-empty">Select a version to compare with.</p>
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
          <p className="diff-empty">No changes</p>
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
      {renderDiffSection("Workflow Transitions", result.workflow.transitions, t => `${t.fromState} → ${t.toState} (${t.transitionId})`)}
      {renderDiffSection("Document Types", result.documents, d => d.label || d.docTypeId)}
    </>
  );

  // ---- Sub-view: Version detail (top-level) ----

  const renderVersionDetail = () => {
    if (!versionDetail && loading) {
      return <SkeletonBlock height="20rem" />;
    }
    if (!versionDetail) return <p className="svc-empty">Version not found.</p>;

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
          {(["workflow", "documents", "compare"] as DetailTab[]).map(tab => (
            <button
              key={tab}
              className={`svc-tab ${activeTab === tab ? "svc-tab--active" : ""}`}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {activeTab === "workflow" && renderWorkflowTab()}
        {activeTab === "documents" && renderDocumentsTab()}
        {activeTab === "compare" && renderCompareTab()}
      </>
    );
  };

  // ---- Main render ----

  return (
    <div className="page">
      <a href="#svc-main" className="skip-link">Skip to main content</a>
      <header className="page__header">
        <div className="topbar">
          <div>
            <p className="eyebrow">PUDA Officer Workbench</p>
            <h1>Service Configuration</h1>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} resolvedTheme={resolvedTheme} onThemeChange={setTheme} idSuffix="svc-config" />
          </div>
        </div>
      </header>

      <main id="svc-main" role="main">
        {isOffline && (
          <Alert variant="warning" className="view-feedback">
            Offline mode is active. Service config data cannot be loaded.
          </Alert>
        )}
        {error && <Alert variant="error" className="view-feedback">{error}</Alert>}

        {subView === "service-list" && renderServiceList()}
        {subView === "version-list" && renderVersionList()}
        {subView === "version-detail" && renderVersionDetail()}
      </main>
    </div>
  );
}
