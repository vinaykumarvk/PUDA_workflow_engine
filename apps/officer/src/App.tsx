/**
 * Officer Portal — Main App (thin router).
 * Decomposed into: OfficerLogin, Inbox, TaskDetail, SearchPanel.
 */
import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import "./app.css";
import { Alert, Button, useToast, SkeletonBlock } from "@puda/shared";
import { Task, Application, apiBaseUrl } from "./types";
import { useOfficerAuth } from "./useOfficerAuth";
import OfficerLogin from "./OfficerLogin";
import ThemeToggle from "./ThemeToggle";

const Inbox = lazy(() => import("./Inbox"));
const TaskDetail = lazy(() => import("./TaskDetail"));
const SearchPanel = lazy(() => import("./SearchPanel"));
import { useTheme } from "./theme";

type View = "inbox" | "task" | "search";

export default function App() {
  const { auth, login, logout, authHeaders, postings, roles, authorities } = useOfficerAuth();
  const { theme, resolvedTheme, setTheme } = useTheme("puda_officer_theme");
  const { showToast } = useToast();

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

  const officerUserId = auth?.user.user_id || "";

  const loadInbox = useCallback(async () => {
    if (!officerUserId) return;
    if (isOffline) {
      setError("Offline mode is active. Inbox data is unavailable until connection is restored.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const authorityParam = authorities.length > 0 ? `&authorityId=${authorities[0]}` : "";
      const res = await fetch(
        `${apiBaseUrl}/api/v1/tasks/inbox?userId=${officerUserId}&status=PENDING${authorityParam}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [officerUserId, authorities, authHeaders, isOffline]);

  const loadApplication = async (arn: string) => {
    if (isOffline) {
      setError("Offline mode is active. Application details cannot be loaded.");
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
      setInboxFeedback({ variant: "warning", text: "Offline mode is active. Task actions are disabled." });
      return;
    }
    setInboxFeedback(null);
    setFromSearch(false);
    setSelectedTask(task);
    await loadApplication(task.arn);
    // Auto-assign task to current officer
    if (task.task_id) {
      await fetch(`${apiBaseUrl}/api/v1/tasks/${task.task_id}/assign`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ userId: officerUserId }),
      }).catch(() => {});
    }
    setView("task");
  };

  const handleSearchSelect = async (app: Application) => {
    if (isOffline) {
      setInboxFeedback({ variant: "warning", text: "Offline mode is active. Search results are read-only." });
      return;
    }
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
    setSelectedTask(null);
    setApplication(null);
    setServiceConfig(null);
    setView(fromSearch ? "search" : "inbox");
    setFromSearch(false);
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

  // --- Login gate ---
  if (!auth) {
    return <OfficerLogin onLogin={login} />;
  }

  // --- Task detail ---
  if (view === "task" && selectedTask && application) {
    return (
      <Suspense fallback={<div className="page"><div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="2rem" width="50%" /><SkeletonBlock height="4rem" /><SkeletonBlock height="4rem" /></div></div>}>
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
      />
      </Suspense>
    );
  }

  // --- Inbox / Search header ---
  return (
    <div className="page">
      <a href="#officer-main" className="skip-link">
        Skip to main content
      </a>
      <header className="page__header">
        <div className="topbar">
          <div>
            <p className="eyebrow">PUDA Officer Workbench</p>
            <h1>{view === "search" ? "Search Applications" : "My Inbox"}</h1>
            <p className="subtitle">
              {view === "search"
                ? "Search by ARN, applicant name, UPN, plot, or scheme"
                : `${postings.map((p) => p.designation_name).join(", ") || "Loading..."} | Roles: ${roles.join(", ") || "—"}`}
            </p>
          </div>
          <div className="topbar-actions">
            <ThemeToggle
              theme={theme}
              resolvedTheme={resolvedTheme}
              onThemeChange={setTheme}
              idSuffix="officer-home"
            />
            <span className="user-chip" title={auth.user.name}>{auth.user.name}</span>
            <Button onClick={logout} className="ui-btn-ghost" type="button" variant="ghost">
              Logout
            </Button>
            <Button
              onClick={() => setView(view === "search" ? "inbox" : "search")}
              className="search-toggle-btn"
              type="button"
            >
              {view === "search" ? "← Back to Inbox" : "Search"}
            </Button>
          </div>
        </div>
      </header>

      <main id="officer-main" role="main">
        {isOffline ? (
          <Alert variant="warning" className="view-feedback">
            Offline mode is active. Data-changing actions are disabled.
          </Alert>
        ) : null}
        <Suspense fallback={<div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="4rem" /><SkeletonBlock height="4rem" /><SkeletonBlock height="4rem" /></div>}>
          {view === "search" ? (
            <SearchPanel
              authHeaders={authHeaders}
              onSelectApplication={handleSearchSelect}
              isOffline={isOffline}
            />
          ) : (
            <Inbox tasks={tasks} loading={loading} error={error} feedback={inboxFeedback} onTaskClick={handleTaskClick} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
