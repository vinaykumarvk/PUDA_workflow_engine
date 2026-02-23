import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Alert, Button, Card } from "@puda/shared";
import { getStatusBadgeClass, getStatusLabel, formatDate, getServiceDisplayName } from "@puda/shared/utils";
import { readCached, writeCached } from "./cache";
import { incrementCacheTelemetry } from "./cacheTelemetry";
import "./dashboard.css";

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

interface DashboardProps {
  onNavigateToCatalog: () => void;
  onNavigateToApplication: (arn: string) => void;
  onFilterApplications?: (filter: { status?: string; type?: string }) => void;
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
  onFilterApplications,
  isOffline
}: DashboardProps) {
  const { t } = useTranslation();
  const { user, authHeaders } = useAuth();
  const initialLoadRef = useRef(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
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

      // Load stats, applications, pending actions, and notifications in parallel
      const [statsRes, appsRes, actionsRes, notifsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/applications/stats?userId=${user.user_id}`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/applications?userId=${user.user_id}&limit=10`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/applications/pending-actions?userId=${user.user_id}`, { headers: hdrs }),
        fetch(`${apiBaseUrl}/api/v1/notifications?userId=${user.user_id}&limit=5&unreadOnly=true`, { headers: hdrs })
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
        <div className="stats-grid" aria-label={t("loading_dashboard")}>
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
            {t("recent_applications")}
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

        <p className="dashboard-loading-text" role="status">{t("loading_dashboard")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <Alert variant="error">{error}</Alert>
        <div className="dashboard-error-actions">
          <Button onClick={loadDashboardData} className="btn-retry">
            {t("retry")}
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
          Offline mode is active. Changes are disabled.
          {cachedAt ? ` Showing cached data from ${new Date(cachedAt).toLocaleString()}.` : ""}
        </Alert>
      ) : null}

      {refreshing ? (
        <Alert variant="info" className="dashboard-refreshing">
          Updating dashboard...
        </Alert>
      ) : null}

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
              <div className="stat-label">{t("total_applications")}</div>
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
              <div className="stat-label">{t("active")}</div>
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
              <div className="stat-label">{t("pending_action")}</div>
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
              <div className="stat-label">{t("approved")}</div>
            </Button>
          </Card>
        </div>
      )}

      {/* New Service Request - Prominent Button */}
      <div className="new-service-section">
        <Button onClick={onNavigateToCatalog} className="new-service-btn" disabled={isOffline}>
          <span className="new-service-icon" aria-hidden="true">
            <SectionIcon kind="request" />
          </span>
          <div className="new-service-content">
            <span className="new-service-title">{t("new_service_request")}</span>
            <span className="new-service-subtitle">{t("apply_for_service")}</span>
          </div>
          <span className="new-service-arrow">→</span>
        </Button>
      </div>

      {/* Requires Attention - TOP PRIORITY */}
      {hasPendingActions && (
        <div className="section requires-attention">
          <h2 className="section-title">
            <span className="section-icon" aria-hidden="true">
              <SectionIcon kind="attention" />
            </span>
            {t("requires_attention")}
          </h2>
          
          {pendingActions.queries.length > 0 && (
            <div className="attention-cards">
              {pendingActions.queries.map((query) => (
                <Card key={query.query_id} className="attention-card attention-query">
                  <div className="attention-header">
                    <span className="attention-badge">{t("query_raised")}</span>
                    <span className="attention-service">{getServiceDisplayName(query.service_key)}</span>
                  </div>
                  <div className="attention-arn">{query.arn}</div>
                  <div className="attention-message">{query.message.substring(0, 100)}...</div>
                  <div className="attention-footer">
                    <span className="attention-due">
                      {t("respond_by")} {new Date(query.response_due_at).toLocaleDateString()}
                    </span>
                    <Button
                      onClick={() => onNavigateToApplication(query.arn)}
                      className="btn-action attention-action-btn"
                      size="sm"
                      disabled={isOffline}
                    >
                      {t("respond")}
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
                    <span className="attention-badge">{t("document_required")}</span>
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
                      {t("upload_now")}
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
            {t("recent_applications")}
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
                      <span className="app-card-action">{t("view_details")} →</span>
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
                {t("view_all_applications")} →
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
            {t("recent_updates")}
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
                    {t("view_details")}
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
          <h3>{t("welcome_title")}</h3>
          <p>{t("welcome_message")}</p>
          <Button onClick={onNavigateToCatalog} className="btn-primary" disabled={isOffline}>
            {t("apply_now")}
          </Button>
        </div>
      )}
    </div>
  );
}
