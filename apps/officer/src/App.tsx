/**
 * Officer Portal — Main App (app shell with sidebar, bottom nav, avatar menu).
 */
import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import "./app.css";
import { Alert, Button, Drawer, useToast, SkeletonBlock } from "@puda/shared";
import { Task, Application, apiBaseUrl } from "./types";
import { useOfficerAuth } from "./useOfficerAuth";
import OfficerLogin from "./OfficerLogin";
import { useTheme } from "./theme";
import { usePreferences } from "./preferences";
import { SecondaryLanguageProvider } from "./SecondaryLanguageContext";
import { ensureLocaleLoaded } from "./i18n";
import { readCached, writeCached, clearOfficerCachedState } from "./cache";

const Inbox = lazy(() => import("./Inbox"));
const TaskDetail = lazy(() => import("./TaskDetail"));
const SearchPanel = lazy(() => import("./SearchPanel"));
const ComplaintManagement = lazy(() => import("./ComplaintManagement"));
const ServiceConfigView = lazy(() => import("./ServiceConfigView"));
const Settings = lazy(() => import("./Settings"));

type View = "inbox" | "task" | "search" | "complaints" | "service-config" | "settings";

const PAGE_TITLE_KEYS: Record<View, string> = {
  inbox: "app.page_inbox",
  search: "app.page_search",
  task: "app.page_task",
  complaints: "app.page_complaints",
  "service-config": "app.page_service_config",
  settings: "app.page_settings",
};

export default function App() {
  const { auth, login, logout, authHeaders, postings, roles, authorities } = useOfficerAuth();
  const { theme, setTheme } = useTheme("puda_officer_theme");
  const { showToast } = useToast();
  const { t } = useTranslation();

  const officerUserId = auth?.user.user_id || "";
  const { preferences, updatePreference } = usePreferences(apiBaseUrl, authHeaders, officerUserId || undefined);

  const [view, setView] = useState<View>("inbox");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [serviceConfig, setServiceConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inboxFeedback, setInboxFeedback] = useState<{ variant: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const [fromSearch, setFromSearch] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  // Navigation history stack
  type ViewSnapshot = { view: View; fromSearch: boolean };
  const navStackRef = useRef<ViewSnapshot[]>([]);
  const [formDirty, setFormDirty] = useState(false);

  // Inbox cache
  const INBOX_CACHE_KEY = "puda_officer_cache_inbox";
  const INBOX_CACHE_SCHEMA = "officer_inbox_v1";
  const CACHE_5_MIN = 5 * 60 * 1000;

  const handleLogout = useCallback(() => {
    clearOfficerCachedState();
    logout();
  }, [logout]);

  // PERF-026: Lazy-load secondary locale bundle when language preference changes
  useEffect(() => {
    if (preferences.language && preferences.language !== "none") {
      ensureLocaleLoaded(preferences.language);
    }
  }, [preferences.language]);

  // Sync theme preference → useTheme
  useEffect(() => {
    if (preferences.theme !== theme) {
      setTheme(preferences.theme as any);
    }
  }, [preferences.theme]);

  // Sync contrastMode → data-contrast
  useEffect(() => {
    if (preferences.contrastMode === "high") {
      document.documentElement.dataset.contrast = "high";
    } else {
      delete document.documentElement.dataset.contrast;
    }
  }, [preferences.contrastMode]);

  // Sync reduceAnimations → data-reduce-motion
  useEffect(() => {
    if (preferences.reduceAnimations) {
      document.documentElement.dataset.reduceMotion = "true";
    } else {
      delete document.documentElement.dataset.reduceMotion;
    }
  }, [preferences.reduceAnimations]);

  // Avatar menu click-outside + Escape
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleDown = (e: MouseEvent) => {
      if (
        avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node) &&
        avatarBtnRef.current && !avatarBtnRef.current.contains(e.target as Node)
      ) {
        setAvatarMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarMenuOpen(false);
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [avatarMenuOpen]);

  const confirmNavigation = useCallback((): boolean => {
    if (!formDirty) return true;
    return window.confirm(t("common.unsaved_confirm"));
  }, [formDirty, t]);

  const loadInbox = useCallback(async () => {
    if (!officerUserId) return;
    if (isOffline) {
      const cached = readCached<Task[]>(INBOX_CACHE_KEY, { schema: INBOX_CACHE_SCHEMA });
      if (cached) {
        setTasks(cached.data);
        setLoading(false);
        return;
      }
      setError(t("offline.inbox_unavailable"));
      setLoading(false);
      return;
    }
    // Show cached data immediately if available
    const cached = readCached<Task[]>(INBOX_CACHE_KEY, { schema: INBOX_CACHE_SCHEMA, maxAgeMs: CACHE_5_MIN });
    if (cached) {
      setTasks(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const authorityParam = authorities.length > 0 ? `&authorityId=${authorities[0]}` : "";
      const res = await fetch(
        `${apiBaseUrl}/api/v1/tasks/inbox?status=PENDING${authorityParam}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const freshTasks = data.tasks || [];
      setTasks(freshTasks);
      writeCached(INBOX_CACHE_KEY, freshTasks, { schema: INBOX_CACHE_SCHEMA });
    } catch (err) {
      if (!cached) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }, [officerUserId, authorities, authHeaders, isOffline]);

  const loadApplication = async (arn: string) => {
    if (isOffline) {
      setError(t("offline.app_unavailable"));
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/applications/${arn}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const app = await res.json();
      setApplication(app);
      if (app.service_key) {
        const cfgRes = await fetch(`${apiBaseUrl}/api/v1/config/services/${app.service_key}`);
        if (cfgRes.ok) setServiceConfig(await cfgRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleTaskClick = async (task: Task) => {
    if (isOffline) {
      setInboxFeedback({ variant: "warning", text: t("offline.task_disabled") });
      return;
    }
    setInboxFeedback(null);
    navStackRef.current.push({ view, fromSearch });
    setFromSearch(false);
    setSelectedTask(task);
    await loadApplication(task.arn);
    if (task.task_id) {
      await fetch(`${apiBaseUrl}/api/v1/tasks/${task.task_id}/assign`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      }).catch(() => {});
    }
    setView("task");
  };

  const handleSearchSelect = async (app: Application) => {
    if (isOffline) {
      setInboxFeedback({ variant: "warning", text: t("offline.search_readonly") });
      return;
    }
    navStackRef.current.push({ view, fromSearch });
    setFromSearch(true);
    await loadApplication(app.arn);
    setSelectedTask({
      task_id: "",
      arn: app.arn,
      state_id: app.state_id,
      system_role_id: "",
      status: "",
      created_at: app.created_at || "",
    });
    setView("task");
  };

  const handleActionComplete = (feedback?: { variant: "info" | "success" | "warning" | "error"; text: string }) => {
    setInboxFeedback(feedback ?? null);
    if (feedback) showToast(feedback.variant, feedback.text);
    setSelectedTask(null);
    setApplication(null);
    setServiceConfig(null);
    setView("inbox");
    loadInbox();
  };

  useEffect(() => {
    if (!inboxFeedback) return;
    const timeout = window.setTimeout(() => setInboxFeedback(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [inboxFeedback]);

  const handleBack = () => {
    if (!confirmNavigation()) return;
    setFormDirty(false);
    const prev = navStackRef.current.pop();
    if (prev) {
      setView(prev.view);
      setFromSearch(prev.fromSearch);
    } else {
      setView("inbox");
      setFromSearch(false);
    }
    setSelectedTask(null);
    setApplication(null);
    setServiceConfig(null);
  };

  useEffect(() => {
    if (auth && tasks.length === 0 && loading) {
      void loadInbox();
    }
  }, [auth, tasks.length, loading, loadInbox]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Navigate via sidebar/bottom nav
  const navigate = (target: View) => {
    if (!confirmNavigation()) return;
    navStackRef.current.push({ view, fromSearch });
    setFormDirty(false);
    setSelectedTask(null);
    setApplication(null);
    setServiceConfig(null);
    setFromSearch(false);
    setView(target);
    setDrawerOpen(false);
  };

  // --- Login gate ---
  if (!auth) {
    return <OfficerLogin onLogin={login} />;
  }

  const userName = auth.user.name || officerUserId;
  const initial = userName.charAt(0).toUpperCase();
  const sidebarCollapsed = preferences.sidebarCollapsed;
  const pageTitle = t(PAGE_TITLE_KEYS[view] || "");

  // Shared nav items rendered in sidebar + drawer
  const renderNavContent = (context: "sidebar" | "drawer") => (
    <>
      {context === "drawer" && (
        <div className="sidebar__header">
          <p className="sidebar__portal-name">{t("app.brand")}</p>
          <p className="sidebar__user-name">{userName}</p>
        </div>
      )}
      <ul className="sidebar__nav">
        <li>
          <button
            className={`sidebar__item ${view === "inbox" ? "sidebar__item--active" : ""}`}
            onClick={() => navigate("inbox")}
            title={t("nav.inbox")}
          >
            <span className="sidebar__item-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </span>
            <span>{t("nav.inbox")}</span>
          </button>
        </li>
        <li>
          <button
            className={`sidebar__item ${view === "search" ? "sidebar__item--active" : ""}`}
            onClick={() => navigate("search")}
            title={t("nav.search")}
          >
            <span className="sidebar__item-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <span>{t("nav.search")}</span>
          </button>
        </li>
        <li>
          <button
            className={`sidebar__item ${view === "complaints" ? "sidebar__item--active" : ""}`}
            onClick={() => navigate("complaints")}
            title={t("nav.complaints")}
          >
            <span className="sidebar__item-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            <span>{t("nav.complaints")}</span>
          </button>
        </li>
        <li>
          <button
            className={`sidebar__item ${view === "service-config" ? "sidebar__item--active" : ""}`}
            onClick={() => navigate("service-config")}
            title={t("nav.service_config")}
          >
            <span className="sidebar__item-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span>
            <span>{t("nav.service_config")}</span>
          </button>
        </li>
        <li className="sidebar__divider" role="separator" />
        <li>
          <button
            className={`sidebar__item ${view === "settings" ? "sidebar__item--active" : ""}`}
            onClick={() => navigate("settings")}
            title={t("nav.settings")}
          >
            <span className="sidebar__item-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
            </span>
            <span>{t("nav.settings")}</span>
          </button>
        </li>
      </ul>
      <div className="sidebar__footer">
        <button className="sidebar__item" onClick={handleLogout} title={t("nav.logout")}>
          <span className="sidebar__item-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </span>
          <span>{t("nav.logout")}</span>
        </button>
      </div>
    </>
  );

  const suspenseFallback = (
    <div className="panel" style={{ display: "grid", gap: "var(--space-3)" }}>
      <SkeletonBlock height="2rem" width="50%" />
      <SkeletonBlock height="4rem" />
      <SkeletonBlock height="4rem" />
    </div>
  );

  return (
    <SecondaryLanguageProvider lang={preferences.language}>
      <a href="#officer-main" className="skip-link">
        Skip to main content
      </a>

      {/* App Bar */}
      <header className="app-bar">
        <div className="app-bar__inner">
          <button
            className="app-bar__hamburger app-bar__hamburger--desktop-only"
            onClick={() => updatePreference("sidebarCollapsed", !sidebarCollapsed)}
            aria-label={t(sidebarCollapsed ? "app.sidebar_expand" : "app.sidebar_collapse")}
            type="button"
          >
            &#9776;
          </button>
          <div className="app-bar__brand">
            <div className="app-bar__brand-text">
              <span className="app-bar__brand-name">{t("app.brand")}</span>
              <span className="app-bar__page-title">{pageTitle}</span>
            </div>
          </div>
          <div className="app-bar__avatar-wrap" style={{ position: "relative" }}>
            <button
              ref={avatarBtnRef}
              className="app-bar__avatar"
              onClick={() => setAvatarMenuOpen((o) => !o)}
              aria-label="Account menu"
              aria-expanded={avatarMenuOpen}
              type="button"
            >
              {initial}
            </button>
            {avatarMenuOpen && (
              <div className="avatar-menu" ref={avatarMenuRef} role="menu">
                <div className="avatar-menu__header">
                  <span className="avatar-menu__initial">{initial}</span>
                  <span className="avatar-menu__name">{userName}</span>
                </div>
                <div className="avatar-menu__divider" />
                <button
                  className="avatar-menu__item"
                  onClick={() => { setAvatarMenuOpen(false); navigate("settings"); }}
                  role="menuitem"
                  type="button"
                >
                  {t("nav.settings")}
                </button>
                <div className="avatar-menu__divider" />
                <button
                  className="avatar-menu__item avatar-menu__item--danger"
                  onClick={() => { setAvatarMenuOpen(false); handleLogout(); }}
                  role="menuitem"
                  type="button"
                >
                  {t("nav.logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? "sidebar--collapsed" : ""}`}>
        {renderNavContent("sidebar")}
      </aside>

      {/* Mobile Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {renderNavContent("drawer")}
      </Drawer>

      {/* Bottom Navigation (mobile) */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          className={`bottom-nav__tab ${view === "inbox" ? "bottom-nav__tab--active" : ""}`}
          onClick={() => navigate("inbox")}
          type="button"
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span className="bottom-nav__label">{t("nav.inbox")}</span>
        </button>
        <button
          className={`bottom-nav__tab ${view === "search" ? "bottom-nav__tab--active" : ""}`}
          onClick={() => navigate("search")}
          type="button"
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <span className="bottom-nav__label">{t("nav.search")}</span>
        </button>
        <button
          className={`bottom-nav__tab ${view === "complaints" ? "bottom-nav__tab--active" : ""}`}
          onClick={() => navigate("complaints")}
          type="button"
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span className="bottom-nav__label">{t("nav.complaints")}</span>
        </button>
        <button
          className={`bottom-nav__tab ${view === "service-config" ? "bottom-nav__tab--active" : ""}`}
          onClick={() => navigate("service-config")}
          type="button"
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </span>
          <span className="bottom-nav__label">{t("nav.config_short")}</span>
        </button>
        <button
          className="bottom-nav__tab"
          onClick={() => setDrawerOpen(true)}
          type="button"
          aria-label="More navigation options"
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </span>
          <span className="bottom-nav__label">{t("nav.more")}</span>
        </button>
      </nav>

      {/* Main Content */}
      <div className={`app-layout ${sidebarCollapsed ? "app-layout--sidebar-collapsed" : ""}`}>
        <div className="app-layout__main">
          {isOffline && (
            <Alert variant="warning" className="view-feedback">
              {t("offline.banner")}
            </Alert>
          )}

          <main id="officer-main" role="main">
            <Suspense fallback={suspenseFallback}>
              {view === "inbox" && (
                <>
                  <div className="page__header">
                    <h1>{t("app.page_inbox")}</h1>
                    <p className="subtitle">
                      {postings.map((p) => p.designation_name).join(", ") || "Loading..."} | Roles: {roles.join(", ") || "\u2014"}
                    </p>
                  </div>
                  {inboxFeedback && (
                    <Alert variant={inboxFeedback.variant} className="view-feedback">{inboxFeedback.text}</Alert>
                  )}
                  <Inbox tasks={tasks} loading={loading} error={error} feedback={inboxFeedback} onTaskClick={handleTaskClick} />
                </>
              )}

              {view === "search" && (
                <SearchPanel
                  authHeaders={authHeaders}
                  onSelectApplication={handleSearchSelect}
                  isOffline={isOffline}
                />
              )}

              {view === "task" && selectedTask && application && (
                <TaskDetail
                  task={selectedTask}
                  application={application}
                  serviceConfig={serviceConfig}
                  officerUserId={officerUserId}
                  authHeaders={authHeaders}
                  isOffline={isOffline}
                  fromSearch={fromSearch}
                  onBack={handleBack}
                  onActionComplete={handleActionComplete}
                  onApplicationUpdate={(updater) => setApplication((prev) => prev ? updater(prev) : prev)}
                  onDirtyChange={setFormDirty}
                />
              )}

              {view === "complaints" && (
                <ComplaintManagement
                  authHeaders={authHeaders}
                  isOffline={isOffline}
                  onBack={() => navigate("inbox")}
                />
              )}

              {view === "service-config" && (
                <ServiceConfigView
                  authHeaders={authHeaders}
                  isOffline={isOffline}
                  onBack={() => navigate("inbox")}
                />
              )}

              {view === "settings" && (
                <Settings
                  preferences={preferences}
                  onUpdatePreference={updatePreference}
                />
              )}
            </Suspense>
          </main>
        </div>
      </div>
    </SecondaryLanguageProvider>
  );
}
