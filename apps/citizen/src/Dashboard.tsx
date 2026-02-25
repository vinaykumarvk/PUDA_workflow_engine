import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Alert, Button, Card } from "@puda/shared";
import { getStatusBadgeClass, getStatusLabel, formatDate, getServiceDisplayName } from "@puda/shared/utils";
import { readCached, writeCached } from "./cache";
import { incrementCacheTelemetry } from "./cacheTelemetry";
import { Bilingual } from "./Bilingual";
import "./dashboard.css";
import "./onboarding.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

interface Application {
  arn: string;
  service_key: string;
  state_id: string;
  created_at: string;
  submitted_at?: string;
  disposal_type?: string;
}

interface Stats {
  total: number;
  active: number;
  pendingAction: number;
  approved: number;
}

interface PendingAction {
  queries: Array<{
    arn: string;
    service_key: string;
    query_id: string;
    query_number: number;
    message: string;
    response_due_at: string;
  }>;
  documentRequests: Array<{
    arn: string;
    service_key: string;
    doc_type_id: string;
    doc_type_name: string;
  }>;
}

interface Notification {
  notification_id: string;
  arn: string;
  event_type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface DocLockerSummary {
  total: number;
  uploaded: number;
  issued: number;
  valid: number;
  expired: number;
  mismatch: number;
  cancelled: number;
  expiringSoon: number;
}

interface ProfileCompleteness {
  completionPercent?: number;
  sections?: {
    identity?: { complete: boolean };
    personal?: { complete: boolean };
    contact?: { complete: boolean };
    address?: { complete: boolean };
  };
}

interface DashboardProps {
  onNavigateToCatalog: () => void;
  onNavigateToApplication: (arn: string) => void;
  onNavigateToLocker?: (filter?: string) => void;
  onNavigateToComplaints?: () => void;
  onFilterApplications?: (filter: { status?: string; type?: string }) => void;
  onNavigateToProfile?: () => void;
  profileCompleteness?: ProfileCompleteness | null;
  isOffline: boolean;
}

function SectionIcon({
  kind
}: {
  kind: "applications" | "attention" | "notifications" | "request" | "empty";
}) {
  switch (kind) {
    case "attention":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 4L3 20h18L12 4z" />
          <path d="M12 9v5" />
          <circle cx="12" cy="17" r="1" />
        </svg>
      );
    case "notifications":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 16H6l1.5-2v-3a4.5 4.5 0 019 0v3L18 16z" />
          <path d="M10 18a2 2 0 004 0" />
        </svg>
      );
    case "request":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 7v10M7 12h10" />
        </svg>
      );
    case "empty":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v6h5" />
        </svg>
      );
    case "applications":
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 3h8l4 4v14H4V3h4z" />
          <path d="M8 11h8M8 15h8" />
        </svg>
      );
  }
}

type DashboardCachePayload = {
  stats: Stats | null;
  applications: Application[];
  pendingActions: PendingAction | null;
  notifications: Notification[];
};

const DASHBOARD_CACHE_SCHEMA = "citizen-dashboard-v1";
const DASHBOARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isStatsPayload(value: unknown): value is Stats {
  return (
    isRecord(value) &&
    typeof value.total === "number" &&
    typeof value.active === "number" &&
    typeof value.pendingAction === "number" &&
    typeof value.approved === "number"
  );
}

function isApplicationPayload(value: unknown): value is Application {
  return (
    isRecord(value) &&
    typeof value.arn === "string" &&
    typeof value.service_key === "string" &&
    typeof value.state_id === "string" &&
    typeof value.created_at === "string"
  );
}

function isPendingActionPayload(value: unknown): value is PendingAction {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.queries) || !Array.isArray(value.documentRequests)) return false;
  return true;
}

function isNotificationPayload(value: unknown): value is Notification {
  return (
    isRecord(value) &&
    typeof value.notification_id === "string" &&
    typeof value.arn === "string" &&
    typeof value.event_type === "string" &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.read === "boolean" &&
    typeof value.created_at === "string"
  );
}

function isDashboardCachePayload(value: unknown): value is DashboardCachePayload {
  return (
    isRecord(value) &&
    (value.stats === null || isStatsPayload(value.stats)) &&
    Array.isArray(value.applications) &&
    value.applications.every((app: unknown) => isApplicationPayload(app)) &&
    (value.pendingActions === null || isPendingActionPayload(value.pendingActions)) &&
    Array.isArray(value.notifications) &&
    value.notifications.every((notif: unknown) => isNotificationPayload(notif))
  );
}

export default function Dashboard({
  onNavigateToCatalog,
  onNavigateToApplication,
  onNavigateToLocker,
  onNavigateToComplaints,
  onFilterApplications,
  onNavigateToProfile,
  profileCompleteness,
  isOffline
}: DashboardProps) {
  const { t } = useTranslation();
  const { user, authHeaders } = useAuth();
  const initialLoadRef = useRef(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [docLockerSummary, setDocLockerSummary] = useState<DocLockerSummary | null>(null);
  const [complaintSummary, setComplaintSummary] = useState<{ total: number; active: number; resolved: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const dashboardCacheKey = user ? `puda_citizen_dashboard_cache_${user.user_id}` : null;

  const applyCachedDashboard = useCallback(
    (cached: DashboardCachePayload, fetchedAt: string) => {
      setStats(cached.stats);
      setApplications(cached.applications || []);
      setPendingActions(cached.pendingActions);
      setNotifications(cached.notifications || []);
      setCachedAt(fetchedAt);
      setError(null);
    },
    []
  );

  const recordCacheFallback = useCallback((reason: "offline" | "error") => {
    incrementCacheTelemetry("stale_data_served", "dashboard");
    incrementCacheTelemetry(
      reason === "offline" ? "cache_fallback_offline" : "cache_fallback_error",
      "dashboard"
    );
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!user || !dashboardCacheKey) return;

    try {
      if (initialLoadRef.current) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      if (isOffline) {
        const cached = readCached<DashboardCachePayload>(dashboardCacheKey, {
          schema: DASHBOARD_CACHE_SCHEMA,
          maxAgeMs: DASHBOARD_CACHE_TTL_MS,
          validate: isDashboardCachePayload
        });
        if (cached) {
          recordCacheFallback("offline");
          applyCachedDashboard(cached.data, cached.fetchedAt);
        } else {
          setError("Offline and no cached dashboard data is available.");
        }
        return;
      }

      const hdrs = authHeaders();

      // Load stats, applications, pending actions, notifications, and doc locker summary in parallel
      const [statsRes, appsRes, actionsRes, notifsRes, docsRes, complaintsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/applications/stats?userId=${user.user_id}`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/applications?userId=${user.user_id}&limit=10`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/applications/pending-actions?userId=${user.user_id}`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/notifications?userId=${user.user_id}&limit=5&unreadOnly=true`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/citizens/me/documents`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/complaints?limit=100`, { headers: hdrs }),
      ]);

      let nextStats: Stats | null = null;
      let nextApplications: Application[] = [];
      let nextPendingActions: PendingAction | null = null;
      let nextNotifications: Notification[] = [];

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        nextStats = statsData;
        setStats(statsData);
      }

      if (appsRes.ok) {
        const appsData = await appsRes.json();
        nextApplications = appsData.applications || [];
        setApplications(nextApplications);
      }

      if (actionsRes.ok) {
        const actionsData = await actionsRes.json();
        nextPendingActions = actionsData;
        setPendingActions(actionsData);
      }

      if (notifsRes.ok) {
        const notifsData = await notifsRes.json();
        nextNotifications = notifsData.notifications || [];
        setNotifications(nextNotifications);
      }

      if (docsRes.ok) {
        const docsData = await docsRes.json();
        if (docsData.summary) {
          setDocLockerSummary(docsData.summary);
        }
      }

      if (complaintsRes.ok) {
        const complaintsData = await complaintsRes.json();
        const all = complaintsData.complaints || [];
        const active = all.filter((c: any) => !["RESOLVED", "CLOSED", "REJECTED"].includes(c.status)).length;
        const resolved = all.filter((c: any) => c.status === "RESOLVED" || c.status === "CLOSED").length;
        setComplaintSummary({ total: complaintsData.total || all.length, active, resolved });
      }

      if (statsRes.ok && appsRes.ok && actionsRes.ok && notifsRes.ok) {
        const payload: DashboardCachePayload = {
          stats: nextStats,
          applications: nextApplications,
          pendingActions: nextPendingActions,
          notifications: nextNotifications
        };
        const cached = writeCached(dashboardCacheKey, payload, { schema: DASHBOARD_CACHE_SCHEMA });
        setCachedAt(cached.fetchedAt);
      }
    } catch (err) {
      const cached = dashboardCacheKey
        ? readCached<DashboardCachePayload>(dashboardCacheKey, {
            schema: DASHBOARD_CACHE_SCHEMA,
            maxAgeMs: DASHBOARD_CACHE_TTL_MS,
            validate: isDashboardCachePayload
          })
        : null;
      if (cached) {
        recordCacheFallback("error");
        applyCachedDashboard(cached.data, cached.fetchedAt);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      initialLoadRef.current = false;
    }
  }, [
    user,
    dashboardCacheKey,
    isOffline,
    authHeaders,
    applyCachedDashboard,
    recordCacheFallback
  ]);

  useEffect(() => {
    loadDashboardData();
    if (isOffline) return;
    // Refresh every 30 seconds for real-time updates while online.
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData, isOffline]);

  // M3: Utilities imported from @puda/shared/utils

  if (loading) {
    const statsSkeletons = [0, 1, 2, 3];
    const recentSkeletons = [0, 1, 2, 3];
    return (
      <div className="dashboard">
        <div className="stats-grid" aria-label={t("dashboard.loading")}>
          {statsSkeletons.map((idx) => (
            <Card key={idx} className="stat-card stat-card-skeleton" aria-hidden="true">
              <div className="skeleton skeleton-stat-value" />
              <div className="skeleton skeleton-stat-label" />
            </Card>
          ))}
        </div>

        <div className="section recent-applications">
          <h2 className="section-title">
            <span className="section-icon" aria-hidden="true">
              <SectionIcon kind="applications" />
            </span>
            <Bilingual tKey="dashboard.recent_apps" />
          </h2>
          <div className="application-cards">
            {recentSkeletons.map((idx) => (
              <Card key={idx} className="application-card app-card-skeleton" aria-hidden="true">
                <div className="skeleton skeleton-app-title" />
                <div className="skeleton skeleton-app-arn" />
                <div className="skeleton skeleton-app-footer" />
              </Card>
            ))}
          </div>
        </div>

        <p className="dashboard-loading-text" role="status">{t("dashboard.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <Alert variant="error">{error}</Alert>
        <div className="dashboard-error-actions">
          <Button onClick={loadDashboardData} className="btn-retry">
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const hasPendingActions = pendingActions && (
    pendingActions.queries.length > 0 || pendingActions.documentRequests.length > 0
  );

  return (
    <div className="dashboard">
      {isOffline ? (
        <Alert variant="warning" className="dashboard-offline-banner">
          {t("common.offline_banner")}
          {cachedAt ? ` ${t("common.offline_cached", { time: new Date(cachedAt).toLocaleString() })}` : ""}
        </Alert>
      ) : null}

      {refreshing ? (
        <Alert variant="info" className="dashboard-refreshing">
          {t("dashboard.refreshing")}
        </Alert>
      ) : null}

      {/* Profile Completion Card */}
      {profileCompleteness && (profileCompleteness.completionPercent ?? 0) < 100 && onNavigateToProfile && (
        <div className="profile-completion-card">
          <div className="profile-completion-card__title">Complete Your Profile</div>
          <div className="profile-completion-card__bar">
            <div
              className="profile-completion-card__bar-fill"
              style={{ width: `${profileCompleteness.completionPercent ?? 0}%` }}
            />
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--color-text-subtle)", marginBottom: "var(--space-3)" }}>
            {profileCompleteness.completionPercent ?? 0}% complete
          </div>
          {profileCompleteness.sections && (
            <div className="profile-completion-card__sections">
              {(["identity", "personal", "contact", "address"] as const).map((key) => {
                const section = profileCompleteness.sections?.[key];
                const done = section?.complete ?? false;
                return (
                  <span key={key} className="profile-completion-card__section">
                    <span className={done ? "profile-completion-card__check" : "profile-completion-card__cross"}>
                      {done ? "\u2713" : "\u2717"}
                    </span>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </span>
                );
              })}
            </div>
          )}
          <Button variant="primary" onClick={onNavigateToProfile}>
            Complete Profile →
          </Button>
        </div>
      )}

      {/* Quick Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <Card className="stat-card-wrap">
            <Button
              type="button"
              variant="ghost"
              className="stat-card stat-clickable"
              onClick={() => {
                // Show all applications
                onNavigateToApplication("");
              }}
            >
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">{t("dashboard.stat_total")}</div>
            </Button>
          </Card>
          <Card className="stat-card-wrap">
            <Button
              type="button"
              variant="ghost"
              className="stat-card stat-active stat-clickable"
              onClick={() => {
                // Filter by active status
                onNavigateToApplication("");
              }}
            >
              <div className="stat-value">{stats.active}</div>
              <div className="stat-label">{t("dashboard.stat_active")}</div>
            </Button>
          </Card>
          <Card className="stat-card-wrap">
            <Button
              type="button"
              variant="ghost"
              className={`stat-card stat-pending ${stats.pendingAction > 0 ? "stat-clickable" : ""}`}
              disabled={stats.pendingAction <= 0}
              onClick={() => {
                if (stats.pendingAction > 0) {
                  // Scroll to requires attention section
                  setTimeout(() => {
                    const attentionSection = document.querySelector(".requires-attention");
                    if (attentionSection) {
                      attentionSection.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }, 100);
                }
              }}
            >
              <div className="stat-value">{stats.pendingAction}</div>
              <div className="stat-label">{t("dashboard.stat_pending_action")}</div>
            </Button>
          </Card>
          <Card className="stat-card-wrap">
            <Button
              type="button"
              variant="ghost"
              className="stat-card stat-approved stat-clickable"
              onClick={() => {
                // Filter by approved
                onNavigateToApplication("");
              }}
            >
              <div className="stat-value">{stats.approved}</div>
              <div className="stat-label">{t("dashboard.stat_approved")}</div>
            </Button>
          </Card>
        </div>
      )}

      {/* Document Locker stats card */}
      {onNavigateToLocker && (
        <div className="section doc-locker-section">
          <Card className="doc-locker-card">
            <div className="doc-locker-card-header">
              <span className="doc-locker-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 3h7l5 5v13H7z" />
                  <path d="M14 3v6h5" />
                </svg>
              </span>
              <h3 className="doc-locker-card-title"><Bilingual tKey="dashboard.doc_locker_title" /></h3>
            </div>
            {docLockerSummary && docLockerSummary.total > 0 ? (
              <div className="doc-locker-stats-grid">
                <div className="doc-locker-stat">
                  <span className="doc-locker-stat-value">{docLockerSummary.total}</span>
                  <span className="doc-locker-stat-label">{t("dashboard.doc_total")}</span>
                </div>
                <div className="doc-locker-stat">
                  <span className="doc-locker-stat-value doc-locker-stat-value--verified">{docLockerSummary.valid}</span>
                  <span className="doc-locker-stat-label">{t("dashboard.doc_valid")}</span>
                </div>
                <div className={`doc-locker-stat ${docLockerSummary.expired > 0 ? "doc-locker-stat--action" : ""}`}>
                  <span className={`doc-locker-stat-value ${docLockerSummary.expired > 0 ? "doc-locker-stat-value--action" : ""}`}>
                    {docLockerSummary.expired}
                  </span>
                  <span className="doc-locker-stat-label">{t("dashboard.doc_expired")}</span>
                </div>
              </div>
            ) : (
              <p className="doc-locker-empty-text">{t("dashboard.doc_locker_desc")}</p>
            )}
            {docLockerSummary && docLockerSummary.expiringSoon > 0 && (
              <Alert variant="warning" className="doc-locker-expiry-banner">
                {t("dashboard.doc_expiring", { count: docLockerSummary.expiringSoon })}
              </Alert>
            )}
            <div className="doc-locker-card-actions">
              <Button onClick={() => onNavigateToLocker()} variant="secondary" size="sm">
                {t("dashboard.doc_open")}
              </Button>
              {docLockerSummary && docLockerSummary.expired > 0 && (
                <Button onClick={() => onNavigateToLocker("expired")} variant="danger" size="sm">
                  {t("dashboard.doc_view_expired", { count: docLockerSummary.expired })}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Complaints summary card */}
      {onNavigateToComplaints && (
        <div className="section doc-locker-section">
          <Card className="doc-locker-card">
            <div className="doc-locker-card-header">
              <span className="doc-locker-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              <h3 className="doc-locker-card-title"><Bilingual tKey="nav.complaints" /></h3>
            </div>
            {complaintSummary && complaintSummary.total > 0 ? (
              <div className="doc-locker-stats-grid">
                <div className="doc-locker-stat">
                  <span className="doc-locker-stat-value">{complaintSummary.total}</span>
                  <span className="doc-locker-stat-label">{t("dashboard.doc_total")}</span>
                </div>
                <div className="doc-locker-stat">
                  <span className="doc-locker-stat-value doc-locker-stat-value--action">{complaintSummary.active}</span>
                  <span className="doc-locker-stat-label">{t("dashboard.stat_active")}</span>
                </div>
                <div className="doc-locker-stat">
                  <span className="doc-locker-stat-value doc-locker-stat-value--verified">{complaintSummary.resolved}</span>
                  <span className="doc-locker-stat-label">{t("complaints.status_resolved")}</span>
                </div>
              </div>
            ) : (
              <p className="doc-locker-empty-text">{t("complaints.subtitle")}</p>
            )}
            <div className="doc-locker-card-actions">
              <Button onClick={() => onNavigateToComplaints()} variant="secondary" size="sm">
                {t("complaints.my_complaints")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Requires Attention - TOP PRIORITY */}
      {hasPendingActions && (
        <div className="section requires-attention">
          <h2 className="section-title">
            <span className="section-icon" aria-hidden="true">
              <SectionIcon kind="attention" />
            </span>
            <Bilingual tKey="dashboard.requires_attention" />
          </h2>
          
          {pendingActions.queries.length > 0 && (
            <div className="attention-cards">
              {pendingActions.queries.map((query) => (
                <Card key={query.query_id} className="attention-card attention-query">
                  <div className="attention-header">
                    <span className="attention-badge">{t("dashboard.query_raised")}</span>
                    <span className="attention-service">{getServiceDisplayName(query.service_key)}</span>
                  </div>
                  <div className="attention-arn">{query.arn}</div>
                  <div className="attention-message">{query.message.substring(0, 100)}...</div>
                  <div className="attention-footer">
                    <span className="attention-due">
                      {t("dashboard.respond_by")} {new Date(query.response_due_at).toLocaleDateString()}
                    </span>
                    <Button
                      onClick={() => onNavigateToApplication(query.arn)}
                      className="btn-action attention-action-btn"
                      size="sm"
                      disabled={isOffline}
                    >
                      {t("dashboard.respond")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {pendingActions.documentRequests.length > 0 && (
            <div className="attention-cards">
              {pendingActions.documentRequests.map((doc, idx) => (
                <Card key={`${doc.arn}-${doc.doc_type_id}-${idx}`} className="attention-card attention-document">
                  <div className="attention-header">
                    <span className="attention-badge">{t("dashboard.document_required")}</span>
                    <span className="attention-service">{getServiceDisplayName(doc.service_key)}</span>
                  </div>
                  <div className="attention-arn">{doc.arn}</div>
                  <div className="attention-message">Upload: {doc.doc_type_name}</div>
                  <div className="attention-footer">
                    <Button
                      onClick={() => onNavigateToApplication(doc.arn)}
                      className="btn-action attention-action-btn"
                      size="sm"
                      disabled={isOffline}
                    >
                      {t("dashboard.upload_now")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Applications */}
      {applications.length > 0 && (
        <div className="section recent-applications">
          <h2 className="section-title">
            <span className="section-icon" aria-hidden="true">
              <SectionIcon kind="applications" />
            </span>
            <Bilingual tKey="dashboard.recent_apps" />
          </h2>
            <div className="application-cards">
              {applications.map((app) => (
                <Card key={app.arn} className="application-card-wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    className="application-card"
                    onClick={() => onNavigateToApplication(app.arn)}
                  >
                    <div className="app-card-header">
                      <div className="app-service-name">{getServiceDisplayName(app.service_key)}</div>
                      <span className={`status-badge ${getStatusBadgeClass(app.state_id)}`}>
                        {getStatusLabel(app.state_id)}
                      </span>
                    </div>
                    <div className="app-card-arn">{app.arn}</div>
                    <div className="app-card-footer">
                      <span className="app-card-date">
                        {app.submitted_at ? formatDate(app.submitted_at) : formatDate(app.created_at)}
                      </span>
                      <span className="app-card-action">{t("dashboard.view_details")} →</span>
                    </div>
                  </Button>
                </Card>
              ))}
            </div>
          {applications.length >= 10 && (
            <div className="view-all-link">
              <Button
                onClick={() => onNavigateToApplication("")}
                className="btn-view-all"
              >
                {t("dashboard.view_all")} →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="section notifications">
          <h2 className="section-title">
            <span className="section-icon" aria-hidden="true">
              <SectionIcon kind="notifications" />
            </span>
            <Bilingual tKey="dashboard.recent_updates" />
          </h2>
          <div className="notification-list">
            {notifications.map((notif) => (
              <Card
                key={notif.notification_id}
                className={`notification-card ${notif.read ? "" : "unread"}`}
              >
                <div className="notification-layout">
                  <div className="notification-content">
                    <div className="notification-title">{notif.title}</div>
                    <div className="notification-message">{notif.message}</div>
                    <div className="notification-time">{formatDate(notif.created_at)}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="notification-open-btn"
                    onClick={() => onNavigateToApplication(notif.arn)}
                  >
                    {t("dashboard.view_details")}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!stats && applications.length === 0 && !hasPendingActions && (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <SectionIcon kind="empty" />
          </div>
          <h3>{t("dashboard.empty_title")}</h3>
          <p>{t("dashboard.empty_message")}</p>
          <Button onClick={onNavigateToCatalog} className="btn-primary" disabled={isOffline}>
            {t("dashboard.apply_now")}
          </Button>
        </div>
      )}
    </div>
  );
}
