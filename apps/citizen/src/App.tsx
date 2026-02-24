import { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import "./app.css";
import {
  Alert,
  Button,
  Card,
  Modal,
  Breadcrumb,
  Field,
  Input,
  Select,
  useToast,
  timeAgo,
  SkeletonBlock
} from "@puda/shared";
import { FormRenderer } from "@puda/shared/form-renderer";
import { getStatusBadgeClass, getStatusLabel, formatDate, getServiceDisplayName } from "@puda/shared/utils";
import type { FormConfig, CitizenProperty } from "@puda/shared/form-renderer";
import { ErrorBoundary } from "./ErrorBoundary";
import { useAuth } from "./AuthContext";
import Login from "./Login";
import ThemeToggle from "./ThemeToggle";

const Dashboard = lazy(() => import("./Dashboard"));
const ApplicationDetail = lazy(() => import("./ApplicationDetail"));
const DocumentLocker = lazy(() => import("./DocumentLocker"));
import { useTheme } from "./theme";
import { readCached, writeCached } from "./cache";
import { flushCacheTelemetryWithRetry, incrementCacheTelemetry } from "./cacheTelemetry";

type ServiceSummary = {
  serviceKey: string;
  displayName: string;
  category: string;
  description?: string;
};

type FeedbackMessage = {
  variant: "info" | "success" | "warning" | "error";
  text: string;
};

type Application = {
  arn: string;
  service_key: string;
  state_id: string;
  data_jsonb: any;
  created_at: string;
  submitted_at?: string;
  disposal_type?: string;
  documents?: { doc_id: string; doc_type_id: string; original_filename: string }[];
  /** Optimistic concurrency token — must be sent back on updates. */
  rowVersion?: number;
};

type ResumeSnapshot = {
  view: "catalog" | "create" | "track" | "applications" | "locker";
  showDashboard: boolean;
  selectedService: ServiceSummary | null;
  currentApplication: Application | null;
  formData: any;
  updatedAt: string;
};

type NdcDueLine = {
  dueCode: string;
  label: string;
  dueKind: "INSTALLMENT" | "DELAYED_COMPLETION_FEE" | "ADDITIONAL_AREA";
  dueDate: string;
  baseAmount: number;
  interestAmount: number;
  totalDueAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: "PAID" | "PENDING" | "PARTIALLY_PAID";
  paymentDate: string | null;
  daysDelayed: number;
};

type NdcPaymentStatus = {
  propertyUpn: string | null;
  authorityId: string;
  allotmentDate: string | null;
  propertyValue: number;
  annualInterestRatePct: number;
  dcfRatePct: number;
  dues: NdcDueLine[];
  totals: {
    baseAmount: number;
    interestAmount: number;
    totalDueAmount: number;
    paidAmount: number;
    balanceAmount: number;
  };
  allDuesPaid: boolean;
  certificateEligible: boolean;
  generatedAt: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const RESUME_STATE_VERSION = "v1";
const CACHE_SCHEMAS = {
  services: "citizen-services-v1",
  serviceConfig: "citizen-service-config-v1",
  profile: "citizen-profile-v1",
  applications: "citizen-applications-v1",
  applicationDetail: "citizen-application-detail-v1",
  resume: "citizen-resume-v1"
} as const;
const CACHE_TTL_MS = {
  services: 7 * 24 * 60 * 60 * 1000,
  serviceConfig: 7 * 24 * 60 * 60 * 1000,
  profile: 24 * 60 * 60 * 1000,
  applications: 6 * 60 * 60 * 1000,
  applicationDetail: 6 * 60 * 60 * 1000,
  resume: 7 * 24 * 60 * 60 * 1000
} as const;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isServiceSummaryArray(value: unknown): value is ServiceSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.serviceKey === "string" &&
        typeof item.displayName === "string" &&
        typeof item.category === "string"
    )
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

function isApplicationArray(value: unknown): value is Application[] {
  return Array.isArray(value) && value.every((item) => isApplicationPayload(item));
}

function isProfilePayload(value: unknown): value is { applicant?: Record<string, unknown>; completeness?: { isComplete?: boolean; missingFields?: string[] } } {
  if (!isRecord(value)) return false;
  if ("applicant" in value && value.applicant !== undefined && !isRecord(value.applicant)) return false;
  if ("completeness" in value && value.completeness !== undefined) {
    if (!isRecord(value.completeness)) return false;
    if ("isComplete" in value.completeness && typeof value.completeness.isComplete !== "boolean") return false;
    if (
      "missingFields" in value.completeness &&
      value.completeness.missingFields !== undefined &&
      !isStringArray(value.completeness.missingFields)
    ) {
      return false;
    }
  }
  return true;
}

function isServiceConfigPayload(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if ("form" in value && value.form !== undefined && value.form !== null) {
    if (!isRecord(value.form)) return false;
    if (!Array.isArray(value.form.pages)) return false;
  }
  return true;
}

function isResumeSnapshotPayload(value: unknown): value is ResumeSnapshot {
  return (
    isRecord(value) &&
    (value.view === "catalog" || value.view === "create" || value.view === "track" || value.view === "applications" || value.view === "locker") &&
    typeof value.showDashboard === "boolean" &&
    "formData" in value &&
    typeof value.updatedAt === "string" &&
    (value.selectedService === null ||
      (isRecord(value.selectedService) &&
        typeof value.selectedService.serviceKey === "string" &&
        typeof value.selectedService.displayName === "string" &&
        typeof value.selectedService.category === "string")) &&
    (value.currentApplication === null || isApplicationPayload(value.currentApplication))
  );
}

function serviceCacheKey() {
  return "puda_citizen_cache_services";
}

function serviceConfigCacheKey(serviceKey: string) {
  return `puda_citizen_cache_service_config_${serviceKey}`;
}

function applicationsCacheKey(userId: string) {
  return `puda_citizen_cache_applications_${userId}`;
}

function profileCacheKey(userId: string) {
  return `puda_citizen_cache_profile_${userId}`;
}

function applicationDetailCacheKey(userId: string, arn: string) {
  return `puda_citizen_cache_application_detail_${userId}_${arn}`;
}

function resumeStateKey(userId: string) {
  return `puda_citizen_resume_${RESUME_STATE_VERSION}_${userId}`;
}

function lastSyncKey(userId: string) {
  return `puda_citizen_last_sync_${userId}`;
}

export default function App() {
  const { user, isLoading, logout, authHeaders, token } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme("puda_citizen_theme");
  const { showToast } = useToast();
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"catalog" | "create" | "track" | "applications" | "locker">("catalog");
  const [lockerFilter, setLockerFilter] = useState<string | undefined>(undefined);
  const [selectedService, setSelectedService] = useState<ServiceSummary | null>(null);
  const [serviceConfig, setServiceConfig] = useState<any>(null);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [formDirty, setFormDirty] = useState(false);
  const [applicationDetail, setApplicationDetail] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [configLoading, setConfigLoading] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [citizenProperties, setCitizenProperties] = useState<CitizenProperty[]>([]);
  const [citizenDocuments, setCitizenDocuments] = useState<any[]>([]);

  const [profileApplicant, setProfileApplicant] = useState<any>({});
  const [profileComplete, setProfileComplete] = useState(true);
  const [profileMissingFields, setProfileMissingFields] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileEditorSaving, setProfileEditorSaving] = useState(false);
  const [profileEditorError, setProfileEditorError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<Record<string, any>>({});
  const [ndcPaymentStatus, setNdcPaymentStatus] = useState<NdcPaymentStatus | null>(null);
  const [ndcPaymentStatusLoading, setNdcPaymentStatusLoading] = useState(false);
  const [ndcPaymentStatusError, setNdcPaymentStatusError] = useState<string | null>(null);
  const [ndcPaymentPostingDueCode, setNdcPaymentPostingDueCode] = useState<string | null>(null);
  const [ndcPaymentPostingError, setNdcPaymentPostingError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [usingStaleData, setUsingStaleData] = useState(false);
  const [draftConflictArn, setDraftConflictArn] = useState<string | null>(null);
  const [resolvingDraftConflict, setResolvingDraftConflict] = useState(false);
  const resumeHydratedRef = useRef<string | null>(null);

  const markSync = useCallback(
    (timestamp?: string) => {
      if (!user) return;
      const value = timestamp || new Date().toISOString();
      setLastSyncAt(value);
      setUsingStaleData(false);
      localStorage.setItem(lastSyncKey(user.user_id), value);
    },
    [user]
  );

  const markStaleData = useCallback(
    (fetchedAt?: string, reason: "offline" | "error" = "offline", source = "app") => {
      setUsingStaleData(true);
      if (fetchedAt) setLastSyncAt(fetchedAt);
      incrementCacheTelemetry("stale_data_served", source);
      incrementCacheTelemetry(
        reason === "offline" ? "cache_fallback_offline" : "cache_fallback_error",
        source
      );
    },
    []
  );

  const flushCacheTelemetryNow = useCallback(
    async (keepalive = false) => {
      if (!user) return;
      try {
        await flushCacheTelemetryWithRetry({
          apiBaseUrl,
          token,
          userId: user.user_id,
          keepalive,
          maxAttempts: keepalive ? 1 : 3,
          baseDelayMs: 300
        });
      } catch {
        // Best-effort telemetry; ignore network errors to avoid UI impact.
      }
    },
    [user, token]
  );

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const key = profileCacheKey(user.user_id);
    setProfileLoading(true);
    try {
      if (isOffline) {
        const cached = readCached<{ applicant?: Record<string, unknown>; completeness?: { isComplete?: boolean; missingFields?: string[] } }>(key, {
          schema: CACHE_SCHEMAS.profile,
          maxAgeMs: CACHE_TTL_MS.profile,
          validate: isProfilePayload
        });
        if (cached) {
          setProfileApplicant(cached.data.applicant || {});
          setProfileComplete(Boolean(cached.data.completeness?.isComplete));
          setProfileMissingFields(cached.data.completeness?.missingFields || []);
          markStaleData(cached.fetchedAt, "offline", "profile");
          return;
        }
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/profile/me`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof data?.error === "string" && data.error.startsWith("PROFILE_INCOMPLETE")) {
          const missing = data.error.split(":")[1] || "";
          setError(`Profile incomplete. Missing fields: ${missing}`);
          setFeedback(null);
          return;
        }
        throw new Error(data?.error || `API error ${res.status}`);
      }
      const data = await res.json();
      setProfileApplicant(data.applicant || {});
      setProfileComplete(Boolean(data.completeness?.isComplete));
      setProfileMissingFields(data.completeness?.missingFields || []);
      writeCached(key, data, { schema: CACHE_SCHEMAS.profile });
      markSync();
    } catch {
      const cached = readCached<{ applicant?: Record<string, unknown>; completeness?: { isComplete?: boolean; missingFields?: string[] } }>(key, {
        schema: CACHE_SCHEMAS.profile,
        maxAgeMs: CACHE_TTL_MS.profile,
        validate: isProfilePayload
      });
      if (cached) {
        setProfileApplicant(cached.data.applicant || {});
        setProfileComplete(Boolean(cached.data.completeness?.isComplete));
        setProfileMissingFields(cached.data.completeness?.missingFields || []);
        markStaleData(cached.fetchedAt, "error", "profile");
        return;
      }
      setProfileComplete(false);
      setProfileMissingFields(["profile"]);
    } finally {
      setProfileLoading(false);
    }
  }, [user, authHeaders, isOffline, markStaleData, markSync]);

  const loadCitizenProperties = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/citizens/me/properties`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCitizenProperties(data.properties || []);
      }
    } catch {
      // non-fatal — form still works without auto-fill
    }
  }, [user, authHeaders]);

  const loadCitizenDocuments = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/citizens/me/documents`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCitizenDocuments(data.documents || []);
      }
    } catch {
      // non-fatal
    }
  }, [user, authHeaders]);

  // Define functions using useCallback before useEffect hooks
  const loadServices = useCallback(async () => {
    try {
      const key = serviceCacheKey();
      if (isOffline) {
        const cached = readCached<ServiceSummary[]>(key, {
          schema: CACHE_SCHEMAS.services,
          maxAgeMs: CACHE_TTL_MS.services,
          validate: isServiceSummaryArray
        });
        if (cached) {
          setServices(cached.data || []);
          markStaleData(cached.fetchedAt, "offline", "services");
          return;
        }
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/config/services`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setServices(data.services || []);
      writeCached(key, data.services || [], { schema: CACHE_SCHEMAS.services });
      markSync();
    } catch (err) {
      const cached = readCached<ServiceSummary[]>(serviceCacheKey(), {
        schema: CACHE_SCHEMAS.services,
        maxAgeMs: CACHE_TTL_MS.services,
        validate: isServiceSummaryArray
      });
      if (cached) {
        setServices(cached.data || []);
        markStaleData(cached.fetchedAt, "error", "services");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
        setFeedback(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline, markStaleData, markSync]);

  const loadServiceConfig = useCallback(async (serviceKey: string) => {
    const key = serviceConfigCacheKey(serviceKey);
    try {
      if (isOffline) {
        const cached = readCached<Record<string, unknown>>(key, {
          schema: CACHE_SCHEMAS.serviceConfig,
          maxAgeMs: CACHE_TTL_MS.serviceConfig,
          validate: isServiceConfigPayload
        });
        if (cached) {
          setServiceConfig(cached.data);
          markStaleData(cached.fetchedAt, "offline", "service_config");
          return;
        }
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/config/services/${serviceKey}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const config = await res.json();
      if (!config.form) throw new Error("Form configuration not available for this service.");
      setServiceConfig(config);
      writeCached(key, config, { schema: CACHE_SCHEMAS.serviceConfig });
      markSync();
    } catch (err) {
      const cached = readCached<Record<string, unknown>>(key, {
        schema: CACHE_SCHEMAS.serviceConfig,
        maxAgeMs: CACHE_TTL_MS.serviceConfig,
        validate: isServiceConfigPayload
      });
      if (cached) {
        setServiceConfig(cached.data);
        markStaleData(cached.fetchedAt, "error", "service_config");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
        setFeedback(null);
      }
    }
  }, [isOffline, markStaleData, markSync]);

  const loadApplicationDetail = useCallback(async (arn: string) => {
    if (!user) return;
    const key = applicationDetailCacheKey(user.user_id, arn);
    try {
      if (isOffline) {
        const cached = readCached<Application>(key, {
          schema: CACHE_SCHEMAS.applicationDetail,
          maxAgeMs: CACHE_TTL_MS.applicationDetail,
          validate: isApplicationPayload
        });
        if (cached) {
          setApplicationDetail(cached.data);
          markStaleData(cached.fetchedAt, "offline", "application_detail");
          if (cached.data.rowVersion !== undefined) {
            setCurrentApplication((prev) => (prev ? { ...prev, rowVersion: cached.data.rowVersion } : prev));
          }
          return;
        }
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/applications/${arn}`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setApplicationDetail(data);
        writeCached(key, data, { schema: CACHE_SCHEMAS.applicationDetail });
        markSync();
        // Keep rowVersion in sync whenever we reload the detail
        if (data.rowVersion !== undefined) {
          setCurrentApplication(prev => prev ? { ...prev, rowVersion: data.rowVersion } : prev);
        }
      }
    } catch {
      const cached = readCached<Application>(key, {
        schema: CACHE_SCHEMAS.applicationDetail,
        maxAgeMs: CACHE_TTL_MS.applicationDetail,
        validate: isApplicationPayload
      });
      if (cached) {
        setApplicationDetail(cached.data);
        markStaleData(cached.fetchedAt, "error", "application_detail");
      }
    }
  }, [user, authHeaders, isOffline, markStaleData, markSync]);

  // Load user applications for dashboard
  const loadUserApplications = useCallback(async () => {
    if (!user) return;
    const key = applicationsCacheKey(user.user_id);
    try {
      if (isOffline) {
        const cached = readCached<Application[]>(key, {
          schema: CACHE_SCHEMAS.applications,
          maxAgeMs: CACHE_TTL_MS.applications,
          validate: isApplicationArray
        });
        if (cached) {
          setApplications(cached.data || []);
          markStaleData(cached.fetchedAt, "offline", "applications");
          return;
        }
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/applications?userId=${user.user_id}&limit=50`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        writeCached(key, data.applications || [], { schema: CACHE_SCHEMAS.applications });
        markSync();
      }
    } catch (err) {
      const cached = readCached<Application[]>(key, {
        schema: CACHE_SCHEMAS.applications,
        maxAgeMs: CACHE_TTL_MS.applications,
        validate: isApplicationArray
      });
      if (cached) {
        setApplications(cached.data || []);
        markStaleData(cached.fetchedAt, "error", "applications");
      }
    }
  }, [user, authHeaders, isOffline, markStaleData, markSync]);

  // All hooks must be called before any conditional returns
  useEffect(() => {
    if (user) {
      loadServices();
      loadUserApplications();
      loadProfile();
      loadCitizenProperties();
      loadCitizenDocuments();
    }
  }, [user, loadServices, loadUserApplications, loadProfile, loadCitizenProperties, loadCitizenDocuments]);

  useEffect(() => {
    if (user && view === "track" && currentApplication?.arn && !applicationDetail) {
      loadApplicationDetail(currentApplication.arn);
    }
  }, [user, view, currentApplication?.arn, applicationDetail, loadApplicationDetail]);

  useEffect(() => {
    if (user && view === "track" && currentApplication?.service_key && !serviceConfig) {
      loadServiceConfig(currentApplication.service_key);
    }
  }, [user, view, currentApplication?.service_key, serviceConfig, loadServiceConfig]);

  useEffect(() => {
    if (user && view === "create" && selectedService?.serviceKey && !serviceConfig && !configLoading) {
      setConfigLoading(true);
      loadServiceConfig(selectedService.serviceKey).finally(() => setConfigLoading(false));
    }
  }, [user, view, selectedService?.serviceKey, serviceConfig, configLoading, loadServiceConfig]);

  useEffect(() => {
    if (user && view === "create") {
      setFormData((prev: any) => {
        const existingApplicant = prev?.applicant || {};
        const mergedApplicant = { ...existingApplicant, ...profileApplicant };
        return { ...prev, applicant: mergedApplicant };
      });
    }
  }, [user, view, profileApplicant]);

  useEffect(() => {
    if (view !== "create" || selectedService?.serviceKey !== "no_due_certificate") {
      setNdcPaymentStatus(null);
      setNdcPaymentStatusError(null);
      setNdcPaymentStatusLoading(false);
      return;
    }

    const upn = formData?.property?.upn as string | undefined;
    if (!upn) {
      setNdcPaymentStatus(null);
      setNdcPaymentStatusError(null);
      setNdcPaymentStatusLoading(false);
      return;
    }
    // Resolve authority from the citizen's linked property (authoritative source),
    // falling back to the form-selected authority_id if not found.
    const linkedProp = citizenProperties.find(p => p.unique_property_number === upn);
    const authorityId = linkedProp?.authority_id || (formData?.authority_id as string | undefined);
    if (!authorityId) {
      setNdcPaymentStatus(null);
      setNdcPaymentStatusError(null);
      setNdcPaymentStatusLoading(false);
      return;
    }

    if (isOffline) {
      setNdcPaymentStatusError("Offline mode is active. Payment status cannot be refreshed.");
      setNdcPaymentStatusLoading(false);
      return;
    }

    let cancelled = false;
    setNdcPaymentStatusLoading(true);
    setNdcPaymentStatusError(null);
    void (async () => {
      try {
        const qs = new URLSearchParams({ authorityId, upn });
        const res = await fetch(`${apiBaseUrl}/api/v1/ndc/payment-status/by-upn?${qs.toString()}`, {
          headers: authHeaders()
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.message || body?.error || `API error ${res.status}`);
        }
        if (!cancelled) {
          setNdcPaymentStatus(body.paymentStatus || null);
        }
      } catch (err) {
        if (!cancelled) {
          setNdcPaymentStatus(null);
          setNdcPaymentStatusError(err instanceof Error ? err.message : "Failed to load payment status");
        }
      } finally {
        if (!cancelled) {
          setNdcPaymentStatusLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    view,
    selectedService?.serviceKey,
    formData?.authority_id,
    formData?.property?.upn,
    citizenProperties,
    isOffline,
    authHeaders
  ]);

  useEffect(() => {
    if (!user || isOffline) return;
    loadServices();
    loadUserApplications();
    loadProfile();
    if (currentApplication?.arn) {
      loadApplicationDetail(currentApplication.arn);
    }
  }, [isOffline, user, currentApplication?.arn, loadServices, loadUserApplications, loadProfile, loadApplicationDetail]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      void flushCacheTelemetryNow(false);
    };
    const handleOffline = () => setIsOffline(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushCacheTelemetryNow(true);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushCacheTelemetryNow]);

  useEffect(() => {
    if (!user || isOffline) return;
    const interval = window.setInterval(() => {
      void flushCacheTelemetryNow(false);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [user, isOffline, flushCacheTelemetryNow]);

  useEffect(() => {
    if (!user) return;
    const synced = localStorage.getItem(lastSyncKey(user.user_id));
    setLastSyncAt(synced);
  }, [user]);

  useEffect(() => {
    if (user) return;
    resumeHydratedRef.current = null;
    setUsingStaleData(false);
    setLastSyncAt(null);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (resumeHydratedRef.current === user.user_id) return;
    const key = resumeStateKey(user.user_id);
    resumeHydratedRef.current = user.user_id;
    const cached = readCached<ResumeSnapshot>(key, {
      schema: CACHE_SCHEMAS.resume,
      maxAgeMs: CACHE_TTL_MS.resume,
      validate: isResumeSnapshotPayload
    });
    if (!cached) return;
    const snapshot = cached.data;
    setView(snapshot.view || "catalog");
    setShowDashboard(Boolean(snapshot.showDashboard));
    setSelectedService(snapshot.selectedService || null);
    setCurrentApplication(snapshot.currentApplication || null);
    setFormData(snapshot.formData || {});
    const resumeTime = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : "your last session";
    setFeedback({
      variant: "info",
      text: `Resumed your previous session from ${resumeTime}.`
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const snapshot: ResumeSnapshot = {
      view,
      showDashboard,
      selectedService,
      currentApplication,
      formData,
      updatedAt: new Date().toISOString()
    };
    writeCached(resumeStateKey(user.user_id), snapshot, { schema: CACHE_SCHEMAS.resume });
  }, [user, view, showDashboard, selectedService, currentApplication, formData]);

  useEffect(() => {
    if (!formDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formDirty]);

  const handleLogout = useCallback(() => {
    void flushCacheTelemetryNow(true).finally(() => logout());
  }, [flushCacheTelemetryNow, logout]);

  const reloadLatestDraftVersion = useCallback(async () => {
    if (!draftConflictArn) return;
    setResolvingDraftConflict(true);
    setError(null);
    try {
      await loadApplicationDetail(draftConflictArn);
      const freshRes = await fetch(`${apiBaseUrl}/api/v1/applications/${draftConflictArn}`, {
        headers: authHeaders()
      });
      if (!freshRes.ok) throw new Error(`API error ${freshRes.status}`);
      const freshApp = await freshRes.json();
      setCurrentApplication({ ...freshApp, rowVersion: freshApp.rowVersion });
      setFormData(freshApp.data_jsonb || {});
      setFeedback({
        variant: "info",
        text: "Loaded the latest saved draft. Re-apply your pending edits before saving again."
      });
      markSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the latest draft");
      setFeedback(null);
    } finally {
      setResolvingDraftConflict(false);
      setDraftConflictArn(null);
    }
  }, [authHeaders, draftConflictArn, loadApplicationDetail, markSync]);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(amount || 0);
  }, []);

  const postNdcPaymentByUpn = useCallback(
    async (dueCode: string) => {
      if (isOffline) {
        setNdcPaymentPostingError("You are offline. Payment posting is unavailable.");
        return;
      }
      const authorityId = formData?.authority_id as string | undefined;
      const upn = formData?.property?.upn as string | undefined;
      if (!authorityId || !upn) {
        setNdcPaymentPostingError("Select authority and property UPN before posting payment.");
        return;
      }
      setNdcPaymentPostingDueCode(dueCode);
      setNdcPaymentPostingError(null);
      try {
        const qs = new URLSearchParams({ authorityId, upn });
        const res = await fetch(`${apiBaseUrl}/api/v1/ndc/payments/by-upn?${qs.toString()}`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ dueCode }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.message || body?.error || `API error ${res.status}`);
        }
        setNdcPaymentStatus(body.paymentStatus || null);
        const paidAmount = body?.paymentPosted?.amount;
        showToast("success", paidAmount ? `Payment posted for ${dueCode}: ${formatCurrency(Number(paidAmount))}` : `Payment posted for ${dueCode}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to post payment";
        setNdcPaymentPostingError(message);
        showToast("error", message);
      } finally {
        setNdcPaymentPostingDueCode(null);
      }
    },
    [isOffline, formData?.authority_id, formData?.property?.upn, authHeaders, showToast, formatCurrency]
  );

  const openProfileEditor = useCallback(() => {
    setProfileDraft({
      salutation: profileApplicant?.salutation || "",
      first_name: profileApplicant?.first_name || "",
      middle_name: profileApplicant?.middle_name || "",
      last_name: profileApplicant?.last_name || "",
      full_name: profileApplicant?.full_name || "",
      father_name: profileApplicant?.father_name || "",
      gender: profileApplicant?.gender || "",
      marital_status: profileApplicant?.marital_status || "",
      date_of_birth: profileApplicant?.date_of_birth || "",
      aadhaar: profileApplicant?.aadhaar || "",
      pan: profileApplicant?.pan || "",
      email: profileApplicant?.email || "",
      mobile: profileApplicant?.mobile || ""
    });
    setProfileEditorError(null);
    setProfileEditorOpen(true);
  }, [profileApplicant]);

  const saveProfileDraft = useCallback(async () => {
    if (!user) return;
    if (isOffline) {
      setProfileEditorError("You are offline. Personal details can be updated only when online.");
      return;
    }
    setProfileEditorSaving(true);
    setProfileEditorError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/profile/me`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ applicant: profileDraft })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `API error ${res.status}`);
      }
      setProfileApplicant(body.applicant || {});
      setProfileComplete(Boolean(body.completeness?.isComplete));
      setProfileMissingFields(body.completeness?.missingFields || []);
      setFormData((prev: any) => ({
        ...prev,
        applicant: { ...(prev?.applicant || {}), ...(body.applicant || {}) }
      }));
      writeCached(profileCacheKey(user.user_id), body, { schema: CACHE_SCHEMAS.profile });
      markSync();
      setProfileEditorOpen(false);
      setFeedback({ variant: "success", text: "Personal details updated successfully." });
    } catch (err) {
      setProfileEditorError(err instanceof Error ? err.message : "Failed to update personal details");
    } finally {
      setProfileEditorSaving(false);
    }
  }, [user, isOffline, authHeaders, profileDraft, markSync]);

  const renderTopbarActions = (idSuffix: string) => (
    <div className="topbar-actions">
      <ThemeToggle
        theme={theme}
        resolvedTheme={resolvedTheme}
        onThemeChange={setTheme}
        idSuffix={idSuffix}
      />
      <span className="user-chip" title={user?.name}>{user?.name}</span>
      <Button onClick={handleLogout} variant="ghost" className="ui-btn-ghost">
        Logout
      </Button>
    </div>
  );

  const renderResilienceBanner = () => {
    if (!isOffline && !usingStaleData) return null;
    const timestamp = lastSyncAt ? new Date(lastSyncAt).toLocaleString() : null;
    if (isOffline) {
      return (
        <Alert variant="warning" className="view-feedback">
          Offline mode is active. Data-changing actions are disabled.
          {timestamp ? ` Showing cached data from ${timestamp}.` : ""}
        </Alert>
      );
    }
    return (
      <Alert variant="info" className="view-feedback">
        Showing cached data{timestamp ? ` from ${timestamp}` : ""} while the network is recovering.
      </Alert>
    );
  };

  // Show login if not authenticated (after all hooks)
  if (isLoading) {
    return (
      <div className="page">
        <div className="panel" style={{ display: "grid", gap: "var(--space-4)" }}>
          <SkeletonBlock height="1.5rem" width="40%" />
          <SkeletonBlock height="1rem" width="70%" />
          <SkeletonBlock height="1rem" width="55%" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Show dashboard by default after login
  if (showDashboard && view === "catalog") {
    return (
      <div className="page">
        <a href="#citizen-main-dashboard" className="skip-link">
          Skip to main content
        </a>
        <header className="page__header">
          <div className="topbar">
              <div>
                <p className="eyebrow">PUDA Citizen Portal</p>
                <h1>Dashboard</h1>
                <p className="subtitle">Welcome, {user.name}</p>
              </div>
              {renderTopbarActions("dashboard")}
          </div>
        </header>
        <main id="citizen-main-dashboard" role="main">
          <Suspense fallback={<div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /></div>}>
            <Dashboard
              onNavigateToCatalog={() => {
                setError(null);
                setFeedback(null);
                setShowDashboard(false);
                setView("catalog");
              }}
              onNavigateToApplication={async (arn) => {
                setError(null);
                setFeedback(null);
                if (arn) {
                  await openApplication(arn);
                } else {
                  setShowDashboard(false);
                  setView("applications");
                }
              }}
              onNavigateToLocker={(filter?: string) => {
                setError(null);
                setFeedback(null);
                setLockerFilter(filter);
                setShowDashboard(false);
                setView("locker");
              }}
              isOffline={isOffline}
            />
          </Suspense>
        </main>
      </div>
    );
  }

  const ensureProfileComplete = (): boolean => {
    if (profileLoading) {
      setError(null);
      setFeedback({ variant: "warning", text: "Profile is still loading. Please wait and try again." });
      return false;
    }
    if (!profileComplete) {
      setError(null);
      setFeedback({
        variant: "warning",
        text: "Your profile is incomplete. Please update your profile to proceed."
      });
      return false;
    }
    setFeedback(null);
    return true;
  };

  const createApplication = async () => {
    if (!selectedService || !user) return;
    if (isOffline) {
      setError(null);
      setFeedback({ variant: "warning", text: "You are offline. Application creation is unavailable in read-only mode." });
      return;
    }
    if (!ensureProfileComplete()) return;
    
    try {
      setError(null);
      const res = await fetch(`${apiBaseUrl}/api/v1/applications`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          authorityId: formData.authority_id || "PUDA",
          serviceKey: selectedService.serviceKey,
          applicantUserId: user.user_id,
          data: formData
        })
      });
      
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const app = await res.json();
      setCurrentApplication({ ...app, rowVersion: app.rowVersion });
      setFeedback({
        variant: "success",
        text: "Application draft created. You can continue adding details and documents before submission."
      });
      setView("track");
      markSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setFeedback(null);
    }
  };

  const saveDraft = async () => {
    if (!selectedService || !user) return;
    if (isOffline) {
      setError(null);
      setFeedback({ variant: "warning", text: "You are offline. Draft saving is unavailable in read-only mode." });
      return;
    }
    if (!ensureProfileComplete()) return;
    
    try {
      setError(null);
      if (currentApplication && currentApplication.state_id === "DRAFT") {
        // Update existing draft — send rowVersion for optimistic concurrency
        const res = await fetch(`${apiBaseUrl}/api/v1/applications/${currentApplication.arn}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            data: formData,
            userId: user.user_id,
            rowVersion: currentApplication.rowVersion
          })
        });
        
        if (res.status === 409) {
          // Another session/user modified this draft since we loaded it.
          setDraftConflictArn(currentApplication.arn);
          setFeedback({
            variant: "warning",
            text: "This draft was updated in another session. Reload the latest version to continue."
          });
          return;
        }
        
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (typeof data?.error === "string" && data.error.startsWith("PROFILE_INCOMPLETE")) {
            const missing = data.error.split(":")[1] || "";
            setError(null);
            setFeedback({ variant: "warning", text: `Profile incomplete. Missing fields: ${missing}` });
            return;
          }
          throw new Error(data?.error || `API error ${res.status}`);
        }
        const app = await res.json();
        setCurrentApplication({ ...app, rowVersion: app.rowVersion });
        setFormDirty(false);
        showToast("success", "Draft saved successfully.");
        setFeedback({ variant: "success", text: "Draft saved successfully." });
        markSync();
      } else {
        const res = await fetch(`${apiBaseUrl}/api/v1/applications`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            authorityId: formData.authority_id || "PUDA",
            serviceKey: selectedService.serviceKey,
            applicantUserId: user.user_id,
            data: formData
          })
        });
        
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (typeof data?.error === "string" && data.error.startsWith("PROFILE_INCOMPLETE")) {
            const missing = data.error.split(":")[1] || "";
            setError(null);
            showToast("warning", `Profile incomplete. Missing fields: ${missing}`);
            setFeedback({ variant: "warning", text: `Profile incomplete. Missing fields: ${missing}` });
            return;
          }
          throw new Error(data?.error || `API error ${res.status}`);
        }
        const app = await res.json();
        setCurrentApplication({ ...app, rowVersion: app.rowVersion });
        setFormDirty(false);
        showToast("success", "Draft saved successfully.");
        setFeedback({ variant: "success", text: "Draft saved successfully." });
        markSync();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save draft";
      setError(msg);
      showToast("error", msg);
      setFeedback(null);
    }
  };

  const submitApplication = async () => {
    if (!currentApplication || !user) return;
    if (isOffline) {
      setError(null);
      setFeedback({ variant: "warning", text: "You are offline. Submission is unavailable in read-only mode." });
      return;
    }
    if (!ensureProfileComplete()) return;
    
    try {
      setError(null);
      const res = await fetch(`${apiBaseUrl}/api/v1/applications/${currentApplication.arn}/submit`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          userId: user.user_id
        })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof data?.error === "string" && data.error.startsWith("PROFILE_INCOMPLETE")) {
          const missing = data.error.split(":")[1] || "";
          setError(null);
          setFeedback({ variant: "warning", text: `Profile incomplete. Missing fields: ${missing}` });
          return;
        }
        throw new Error(data?.error || `API error ${res.status}`);
      }
      const result = await res.json();
      setCurrentApplication({ ...currentApplication, arn: result.submittedArn, state_id: "SUBMITTED" });
      setFormDirty(false);
      showToast("success", `Application submitted successfully. ARN: ${result.submittedArn}`);
      setFeedback({
        variant: "success",
        text: `Application submitted successfully. ARN: ${result.submittedArn}`
      });
      markSync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      showToast("error", msg);
      setFeedback(null);
    }
  };

  const handleStartApplication = async (service: ServiceSummary) => {
    if (isOffline) {
      setError(null);
      setFeedback({ variant: "warning", text: "You are offline. Starting a new application is disabled in read-only mode." });
      return;
    }
    setSelectedService(service);
    setServiceConfig(null);
    setError(null);
    setFeedback(null);
    setConfigLoading(true);
    try {
      await loadServiceConfig(service.serviceKey);
      setView("create");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleDocumentUpload = async (docTypeId: string, file: File) => {
    if (!currentApplication || !user) return;
    if (isOffline) {
      setError(null);
      showToast("warning", "You are offline. Document upload is unavailable.");
      setFeedback({ variant: "warning", text: "You are offline. Document upload is unavailable in read-only mode." });
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      setError(null);
      const form = new FormData();
      form.append("arn", currentApplication.arn);
      form.append("docTypeId", docTypeId);
      form.append("userId", user.user_id);
      form.append("file", file);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${apiBaseUrl}/api/v1/documents/upload`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error("Upload failed"));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.send(form);
      });

      await loadApplicationDetail(currentApplication.arn);
      showToast("success", `Document uploaded for ${docTypeId}.`);
      setFeedback({ variant: "success", text: `Document uploaded successfully for ${docTypeId}.` });
      markSync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      showToast("error", msg);
      setFeedback(null);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleReuseDocument = async (citizenDocId: string, docTypeId: string) => {
    if (!currentApplication || !user) return;
    if (isOffline) {
      showToast("warning", "You are offline. Document reuse is unavailable.");
      return;
    }
    try {
      setError(null);
      const res = await fetch(`${apiBaseUrl}/api/v1/citizens/me/documents/reuse`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          citizenDocId,
          arn: currentApplication.arn,
          docTypeId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to reuse document");
      }
      await loadApplicationDetail(currentApplication.arn);
      showToast("success", `Document reused from your Document Locker for ${docTypeId}.`);
      setFeedback({ variant: "success", text: `Document from your locker linked to this application.` });
      markSync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reuse document";
      setError(msg);
      showToast("error", msg);
    }
  };

  async function openApplication(arn: string) {
    if (!user) return;
    setError(null);
    setFeedback(null);
    const cacheKey = applicationDetailCacheKey(user.user_id, arn);
    try {
      if (!isOffline) {
        const res = await fetch(`${apiBaseUrl}/api/v1/applications/${arn}`, { headers: authHeaders() });
        if (res.ok) {
          const appData = await res.json();
          setCurrentApplication({
            arn: appData.arn,
            service_key: appData.service_key,
            state_id: appData.state_id,
            data_jsonb: appData.data_jsonb,
            created_at: appData.created_at,
            submitted_at: appData.submitted_at,
            disposal_type: appData.disposal_type,
            documents: appData.documents,
            rowVersion: appData.rowVersion
          });
          setApplicationDetail(appData);
          writeCached(cacheKey, appData, { schema: CACHE_SCHEMAS.applicationDetail });
          await loadServiceConfig(appData.service_key);
          setView("track");
          setShowDashboard(false);
          markSync();
          return;
        }
      }
      const cached = readCached<Application>(cacheKey, {
        schema: CACHE_SCHEMAS.applicationDetail,
        maxAgeMs: CACHE_TTL_MS.applicationDetail,
        validate: isApplicationPayload
      });
      if (cached) {
        const appData = cached.data;
        setCurrentApplication({
          arn: appData.arn,
          service_key: appData.service_key,
          state_id: appData.state_id,
          data_jsonb: appData.data_jsonb,
          created_at: appData.created_at,
          submitted_at: appData.submitted_at,
          disposal_type: appData.disposal_type,
          documents: appData.documents,
          rowVersion: appData.rowVersion
        });
        setApplicationDetail(appData);
        await loadServiceConfig(appData.service_key);
        setView("track");
        setShowDashboard(false);
        markStaleData(cached.fetchedAt, isOffline ? "offline" : "error", "application_open");
        return;
      }
      throw new Error("Application details are unavailable offline.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load application");
      setFeedback(null);
    }
  }

  const ndcPaymentStatusPanel =
    selectedService?.serviceKey === "no_due_certificate" ? (
      <section className="ndc-payment-panel" id="ndc-payment-status-panel">
        <h3>NDC Payment Ledger</h3>
        {!formData?.property?.upn ? (
          <Alert variant="info">Select a property UPN on the previous page to load payment schedule.</Alert>
        ) : null}
        {ndcPaymentStatusLoading ? (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            <SkeletonBlock height="2.5rem" />
            <SkeletonBlock height="8rem" />
          </div>
        ) : null}
        {ndcPaymentStatusError ? <Alert variant="warning">{ndcPaymentStatusError}</Alert> : null}
        {ndcPaymentPostingError ? <Alert variant="warning">{ndcPaymentPostingError}</Alert> : null}
        {ndcPaymentStatus ? (
          <>
            <p style={{ margin: "0 0 0.75rem", color: "var(--color-text-muted)" }}>
              Allotment Date: {ndcPaymentStatus.allotmentDate || "—"} | Property Value: {formatCurrency(ndcPaymentStatus.propertyValue)} | Interest Rate: {ndcPaymentStatus.annualInterestRatePct}% p.a. | DCF Rate: {ndcPaymentStatus.dcfRatePct}%
            </p>
            <div className="ndc-payment-summary">
              <Card className="ndc-payment-kpi">
                <span>Total Due</span>
                <strong>{formatCurrency(ndcPaymentStatus.totals.totalDueAmount)}</strong>
              </Card>
              <Card className="ndc-payment-kpi">
                <span>Total Paid</span>
                <strong>{formatCurrency(ndcPaymentStatus.totals.paidAmount)}</strong>
              </Card>
              <Card className="ndc-payment-kpi">
                <span>Pending Balance</span>
                <strong>{formatCurrency(ndcPaymentStatus.totals.balanceAmount)}</strong>
              </Card>
            </div>
            {ndcPaymentStatus.certificateEligible ? (
              <Alert variant="success">
                All dues are cleared for {ndcPaymentStatus.propertyUpn}. You can continue to direct certificate download after submission.
              </Alert>
            ) : (
              <Alert variant="warning">
                Pending dues exist. Applicant should proceed to the Payment page to clear dues before certificate download.
              </Alert>
            )}
            <div className="ndc-payment-table-wrap">
              <table className="ndc-payment-table">
                <thead>
                  <tr>
                    <th>Due Type</th>
                    <th>Due Date</th>
                    <th>Payment Date</th>
                    <th>Delay (Days)</th>
                    <th>Base</th>
                    <th>Interest</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ndcPaymentStatus.dues.map((due) => (
                    <tr key={due.dueCode}>
                      <td>{due.label}</td>
                      <td>{due.dueDate}</td>
                      <td>{due.paymentDate || "—"}</td>
                      <td>{due.daysDelayed}</td>
                      <td>{formatCurrency(due.baseAmount)}</td>
                      <td>{formatCurrency(due.interestAmount)}</td>
                      <td>{formatCurrency(due.totalDueAmount)}</td>
                      <td>{formatCurrency(due.paidAmount)}</td>
                      <td>{formatCurrency(due.balanceAmount)}</td>
                      <td>{due.status}</td>
                      <td>
                        {due.balanceAmount > 0.01 ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="form-action-btn"
                            onClick={() => void postNdcPaymentByUpn(due.dueCode)}
                            disabled={Boolean(ndcPaymentPostingDueCode)}
                          >
                            {ndcPaymentPostingDueCode === due.dueCode ? "Posting..." : "Pay Now"}
                          </Button>
                        ) : (
                          "Paid"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    ) : null;

  if (view === "create" && selectedService) {
    return (
      <div className="page">
        <a href="#citizen-main-create" className="skip-link">
          Skip to main content
        </a>
        <header className="page__header">
          <Breadcrumb items={[
            { label: "Services", onClick: () => { setView("catalog"); setError(null); } },
            { label: selectedService.displayName }
          ]} />
          <div className="topbar">
            <div>
              <h1>{selectedService.displayName}</h1>
            </div>
            {renderTopbarActions("create")}
          </div>
        </header>

        <main id="citizen-main-create" className="panel" role="main">
          {renderResilienceBanner()}
          {feedback ? <Alert variant={feedback.variant} className="view-feedback">{feedback.text}</Alert> : null}
          {configLoading && (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              <SkeletonBlock height="2rem" width="50%" />
              <SkeletonBlock height="2.75rem" />
              <SkeletonBlock height="2.75rem" />
            </div>
          )}
          {profileLoading && <SkeletonBlock height="2rem" width="40%" />}
          {error ? <Alert variant="error">{error}</Alert> : null}
          {!profileLoading && !profileComplete && (
            <Alert variant="warning">
              Profile incomplete. Missing fields: {profileMissingFields.join(", ") || "Unknown fields"}. Please update your profile.
            </Alert>
          )}
          {!configLoading && serviceConfig?.form && (
            <>
              <div className="form-actions-top">
                <Button
                  onClick={saveDraft}
                  className="save-draft-btn"
                  type="button"
                  variant="secondary"
                  disabled={isOffline || !profileComplete || profileLoading}
                >
                  Save Draft
                </Button>
              </div>
              <ErrorBoundary fallback={<Alert variant="error">Form could not be loaded. Check console for details.</Alert>}>
                <FormRenderer
                  config={serviceConfig.form as FormConfig}
                  initialData={formData}
                  onChange={(data) => { setFormData(data); setFormDirty(true); }}
                  onSubmit={
                    isOffline
                      ? undefined
                      : async () => { await createApplication(); }
                  }
                  readOnly={isOffline}
                  citizenProperties={citizenProperties}
                  pageActions={[
                    {
                      pageId: "PAGE_APPLICATION",
                      label: "Update Personal Details",
                      onClick: openProfileEditor,
                      disabled: isOffline
                    }
                  ]}
                  pageSupplements={{
                    PAGE_PAYMENT: ndcPaymentStatusPanel
                  }}
                  {...(selectedService?.serviceKey === "no_due_certificate" && (() => {
                    if (isOffline) return {};
                    if (!formData?.property?.upn) {
                      return {
                        submitDisabled: true,
                        submitLabel: "Select a property to continue",
                      };
                    }
                    if (ndcPaymentStatusLoading) {
                      return {
                        submitDisabled: true,
                        submitLabel: "Loading payment status…",
                      };
                    }
                    if (!ndcPaymentStatus) {
                      return {
                        submitDisabled: true,
                        submitLabel: "Payment status unavailable",
                      };
                    }
                    if (!ndcPaymentStatus.certificateEligible) {
                      return {
                        submitOverride: (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem" }}>
                            <span style={{ fontSize: "0.8rem", color: "var(--color-warning, #f59e0b)", fontWeight: 500 }}>
                              Clear all outstanding dues to submit
                            </span>
                            <button
                              type="button"
                              className="form-action-btn form-action-btn--primary"
                              disabled
                              title="Pay all dues using the Pay Now buttons in the ledger above"
                            >
                              Submit (Dues Pending)
                            </button>
                          </div>
                        ),
                      };
                    }
                    return {
                      submitLabel: "Submit & Get Certificate",
                    };
                  })())}
                />
              </ErrorBoundary>
            </>
          )}
          {!configLoading && serviceConfig && !serviceConfig.form && !error && (
            <Alert variant="warning">Form configuration is not available. Please try again later.</Alert>
          )}
        </main>
        <Modal
          open={profileEditorOpen}
          onClose={() => {
            if (!profileEditorSaving) setProfileEditorOpen(false);
          }}
          title="Update Personal Details"
          description="These details are pulled into the Applicant section and validated before submission."
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setProfileEditorOpen(false)}
                disabled={profileEditorSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void saveProfileDraft()}
                disabled={profileEditorSaving}
              >
                {profileEditorSaving ? "Saving..." : "Save Details"}
              </Button>
            </>
          }
        >
          <div className="profile-editor-grid">
            {profileEditorError ? <Alert variant="error">{profileEditorError}</Alert> : null}
            <Field label="Salutation" htmlFor="profile-salutation">
              <Select
                id="profile-salutation"
                value={profileDraft.salutation || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, salutation: e.target.value }))}
              >
                <option value="">Select...</option>
                <option value="MR">Mr.</option>
                <option value="MS">Ms.</option>
                <option value="MRS">Mrs.</option>
              </Select>
            </Field>
            <Field label="First Name" htmlFor="profile-first-name" required>
              <Input
                id="profile-first-name"
                value={profileDraft.first_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </Field>
            <Field label="Middle Name" htmlFor="profile-middle-name">
              <Input
                id="profile-middle-name"
                value={profileDraft.middle_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, middle_name: e.target.value }))}
              />
            </Field>
            <Field label="Last Name" htmlFor="profile-last-name" required>
              <Input
                id="profile-last-name"
                value={profileDraft.last_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </Field>
            <Field label="Full Name" htmlFor="profile-full-name" required>
              <Input
                id="profile-full-name"
                value={profileDraft.full_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </Field>
            <Field label="Father's / Husband's Name" htmlFor="profile-father-name" required>
              <Input
                id="profile-father-name"
                value={profileDraft.father_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, father_name: e.target.value }))}
              />
            </Field>
            <Field label="Gender" htmlFor="profile-gender" required>
              <Select
                id="profile-gender"
                value={profileDraft.gender || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, gender: e.target.value }))}
              >
                <option value="">Select...</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Marital Status" htmlFor="profile-marital-status" required>
              <Select
                id="profile-marital-status"
                value={profileDraft.marital_status || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, marital_status: e.target.value }))}
              >
                <option value="">Select...</option>
                <option value="SINGLE">Single</option>
                <option value="MARRIED">Married</option>
              </Select>
            </Field>
            <Field label="Date of Birth" htmlFor="profile-dob" required>
              <Input
                id="profile-dob"
                type="date"
                value={profileDraft.date_of_birth || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, date_of_birth: e.target.value }))}
              />
            </Field>
            <Field label="Aadhaar" htmlFor="profile-aadhaar" required>
              <Input
                id="profile-aadhaar"
                value={profileDraft.aadhaar || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, aadhaar: e.target.value }))}
              />
            </Field>
            <Field label="PAN" htmlFor="profile-pan" required>
              <Input
                id="profile-pan"
                value={profileDraft.pan || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, pan: e.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Email" htmlFor="profile-email" required>
              <Input
                id="profile-email"
                type="email"
                value={profileDraft.email || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))}
              />
            </Field>
            <Field label="Mobile" htmlFor="profile-mobile" required>
              <Input
                id="profile-mobile"
                value={profileDraft.mobile || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, mobile: e.target.value }))}
              />
            </Field>
          </div>
        </Modal>
        <Modal
          open={Boolean(draftConflictArn)}
          onClose={() => {
            if (!resolvingDraftConflict) setDraftConflictArn(null);
          }}
          title="Draft Updated Elsewhere"
          description="A newer version of this draft exists from another session. Reloading will replace your unsaved local changes."
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDraftConflictArn(null)}
                disabled={resolvingDraftConflict}
              >
                Keep Current Form
              </Button>
              <Button
                type="button"
                variant="warning"
                onClick={() => void reloadLatestDraftVersion()}
                disabled={resolvingDraftConflict}
              >
                {resolvingDraftConflict ? "Reloading..." : "Reload Latest Draft"}
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (view === "track" && currentApplication) {
    return (
      <Suspense fallback={<div className="page"><div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="2rem" width="50%" /><SkeletonBlock height="4rem" /><SkeletonBlock height="4rem" /></div></div>}>
      <ApplicationDetail
        application={currentApplication}
        serviceConfig={serviceConfig}
        detail={applicationDetail || { documents: [], queries: [], tasks: [], timeline: [] }}
        feedback={feedback}
        userId={user.user_id}
        onQueryResponded={async () => {
          if (currentApplication?.arn) {
            await loadApplicationDetail(currentApplication.arn);
          }
        }}
        onBack={() => {
          setView("catalog");
          setShowDashboard(true);
          setCurrentApplication(null);
          setApplicationDetail(null);
        }}
        onSubmit={currentApplication.state_id === "DRAFT" ? submitApplication : undefined}
        onDocumentUpload={handleDocumentUpload}
        onReuseDocument={handleReuseDocument}
        citizenDocuments={citizenDocuments}
        uploading={uploading}
        uploadProgress={uploadProgress}
        isOffline={isOffline}
        staleAt={lastSyncAt}
      />
      </Suspense>
    );
  }

  // Document Locker View
  if (view === "locker") {
    return (
      <div className="page">
        <a href="#citizen-main-locker" className="skip-link">
          Skip to main content
        </a>
        <header className="page__header">
          <div className="topbar">
            <div>
              <Button
                onClick={() => {
                  setShowDashboard(true);
                  setView("catalog");
                }}
                className="back-button"
                variant="ghost"
              >
                ← Back to Dashboard
              </Button>
              <p className="eyebrow">PUDA Citizen Portal</p>
              <h1>My Document Locker</h1>
              <p className="subtitle">View and manage all your uploaded documents</p>
            </div>
            {renderTopbarActions("locker")}
          </div>
        </header>
        <main id="citizen-main-locker" className="panel" role="main">
          {renderResilienceBanner()}
          <Suspense fallback={<div style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /></div>}>
            <DocumentLocker
              onBack={() => {
                setShowDashboard(true);
                setView("catalog");
                setLockerFilter(undefined);
              }}
              isOffline={isOffline}
              initialFilter={lockerFilter}
            />
          </Suspense>
        </main>
      </div>
    );
  }

  // All Applications View — uses shared utils (M3)
  if (view === "applications") {
    return (
      <div className="page">
        <a href="#citizen-main-applications" className="skip-link">
          Skip to main content
        </a>
        <header className="page__header">
          <div className="topbar">
            <div>
              <Button
                onClick={() => {
                  setShowDashboard(true);
                  setView("catalog");
                }}
                className="back-button"
                variant="ghost"
              >
                ← Back to Dashboard
              </Button>
              <p className="eyebrow">PUDA Citizen Portal</p>
              <h1>All Applications</h1>
              <p className="subtitle">View and manage your applications</p>
            </div>
            {renderTopbarActions("applications")}
          </div>
        </header>

        <main id="citizen-main-applications" className="panel" role="main">
          {renderResilienceBanner()}
          {feedback ? <Alert variant={feedback.variant} className="view-feedback">{feedback.text}</Alert> : null}
          {loading && (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {[1, 2, 3].map((i) => <SkeletonBlock key={i} height="4.5rem" />)}
            </div>
          )}
          {error ? <Alert variant="error">{error}</Alert> : null}
          {!loading && !error && applications.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M7 3h7l5 5v13H7z" />
                  <path d="M14 3v6h5" />
                </svg>
              </div>
              <h3>No Applications</h3>
              <p>You haven't submitted any applications yet.</p>
              <Button
                onClick={() => {
                  setShowDashboard(false);
                  setView("catalog");
                }}
                fullWidth
                className="empty-state-action"
                disabled={isOffline}
              >
                Apply for Service
              </Button>
            </div>
          )}
          {!loading && !error && applications.length > 0 && (
            <div className="application-cards">
              {applications.map((app) => (
                <Card key={app.arn} className="application-card-wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    className="application-card"
                    onClick={() => openApplication(app.arn)}
                  >
                    <div className="app-card-header">
                      <div className="app-service-name">{getServiceDisplayName(app.service_key)}</div>
                      <span className={`status-badge ${getStatusBadgeClass(app.state_id)}`}>
                        {getStatusLabel(app.state_id)}
                      </span>
                    </div>
                    <div className="app-card-arn">{app.arn}</div>
                    <div className="app-card-footer">
                      <span className="app-card-date" title={app.submitted_at ? formatDate(app.submitted_at) : formatDate(app.created_at)}>
                        {timeAgo(app.submitted_at || app.created_at)}
                      </span>
                      <span className="app-card-action">View Details →</span>
                    </div>
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <a href="#citizen-main-catalog" className="skip-link">
        Skip to main content
      </a>
      <header className="page__header">
        <div className="topbar">
          <div>
            <Button
              onClick={() => {
                setShowDashboard(true);
                setView("catalog");
              }}
              className="back-button"
              variant="ghost"
            >
              ← Back to Dashboard
            </Button>
            <p className="eyebrow">PUDA Citizen Portal</p>
            <h1>Service Catalog</h1>
            <p className="subtitle">Select a service to apply</p>
          </div>
          {renderTopbarActions("catalog")}
        </div>
      </header>

      <main id="citizen-main-catalog" className="panel" role="main">
        {renderResilienceBanner()}
        {feedback ? <Alert variant={feedback.variant} className="view-feedback">{feedback.text}</Alert> : null}
        {loading && (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {[1, 2, 3, 4].map((i) => <SkeletonBlock key={i} height="5rem" />)}
          </div>
        )}
        {error ? <Alert variant="error">{error}</Alert> : null}
        {!loading && !error && services.length === 0 && <p>No services found.</p>}
        <ul className="service-list">
          {services.map((service) => (
            <li key={service.serviceKey} className="service-card">
              <div>
                <h2>{service.displayName}</h2>
                <p className="service-key">{service.serviceKey}</p>
                <p className="service-desc">{service.description || "No description provided."}</p>
              </div>
              <div className="service-actions">
                <Button onClick={() => handleStartApplication(service)} className="action-button" disabled={isOffline}>
                  Apply Now
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
