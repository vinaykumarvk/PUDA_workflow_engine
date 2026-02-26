import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import "./app.css";
import {
  Alert,
  Button,
  Card,
  Modal,
  Breadcrumb,
  Drawer,
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
import { useTranslation } from "react-i18next";
import { ensureLocaleLoaded } from "./i18n";
import { ErrorBoundary } from "./ErrorBoundary";
import { useAuth } from "./AuthContext";
import Login from "./Login";
import ThemeToggle from "./ThemeToggle";
import { SecondaryLanguageProvider } from "./SecondaryLanguageContext";
import { Bilingual } from "./Bilingual";

const Dashboard = lazy(() => import("./Dashboard"));
const ApplicationDetail = lazy(() => import("./ApplicationDetail"));
const DocumentLocker = lazy(() => import("./DocumentLocker"));
const DocumentUploadPanel = lazy(() => import("./DocumentUploadPanel"));
const Settings = lazy(() => import("./Settings"));
const ReportComplaint = lazy(() => import("./ReportComplaint"));
const Onboarding = lazy(() => import("./Onboarding"));
const ProfileSummaryLazy = lazy(() => import("./Onboarding").then((m) => ({ default: m.ProfileSummary })));
import { useTheme } from "./theme";
import { usePreferences } from "./preferences";
import "./i18n";
import { readCached, writeCached, readOfflineDrafts, writeOfflineDraft, markOfflineDraftSynced, removeOfflineDraft, getUnsyncedDraftCount } from "./cache";
import { flushCacheTelemetryWithRetry, incrementCacheTelemetry } from "./cacheTelemetry";

type ServiceSummary = {
  serviceKey: string;
  displayName: string;
  category: string;
  description?: string;
  submissionValidation?: { propertyRequired?: boolean };
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
  view: "catalog" | "create" | "track" | "applications" | "locker" | "settings" | "profile" | "complaints";
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
    (value.view === "catalog" || value.view === "create" || value.view === "track" || value.view === "applications" || value.view === "locker" || value.view === "settings" || value.view === "profile" || value.view === "guide" || value.view === "complaints") &&
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
  const { preferences, updatePreference } = usePreferences(apiBaseUrl, authHeaders, user?.user_id);
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type ViewId = "catalog" | "create" | "track" | "applications" | "locker" | "settings" | "profile" | "profile-update" | "guide" | "complaints";
  type ViewSnapshot = { view: ViewId; showDashboard: boolean };
  const [view, setView] = useState<ViewId>("catalog");
  const navStackRef = useRef<ViewSnapshot[]>([]);
  const [lockerFilter, setLockerFilter] = useState<string | undefined>(undefined);
  const [selectedService, setSelectedService] = useState<ServiceSummary | null>(null);
  const [serviceConfig, setServiceConfig] = useState<any>(null);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [formDirty, setFormDirty] = useState(false);
  const [applicationDetail, setApplicationDetail] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formStep, setFormStep] = useState<"form" | "documents">("form");
  const [configLoading, setConfigLoading] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [citizenProperties, setCitizenProperties] = useState<CitizenProperty[]>([]);
  const [citizenDocuments, setCitizenDocuments] = useState<any[]>([]);

  const [profileApplicant, setProfileApplicant] = useState<any>({});
  const [profileAddresses, setProfileAddresses] = useState<any>({});
  const [profileComplete, setProfileComplete] = useState(true);
  const [profileMissingFields, setProfileMissingFields] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileEditorSaving, setProfileEditorSaving] = useState(false);
  const [profileEditorError, setProfileEditorError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<Record<string, any>>({});
  const [profileVerification, setProfileVerification] = useState<any>({});
  const [profileCompleteness, setProfileCompleteness] = useState<any>(null);
  const [profileUpdateSection, setProfileUpdateSection] = useState<string | null>(null);
  const onboardingRedirectDone = useRef(false);
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
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getUnsyncedDraftCount());
  const [draftConflictArn, setDraftConflictArn] = useState<string | null>(null);
  const [resolvingDraftConflict, setResolvingDraftConflict] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState("");
  const [submissionConfirmation, setSubmissionConfirmation] = useState<{
    arn: string;
    serviceName: string;
    submittedAt: string;
  } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node) &&
        avatarBtnRef.current && !avatarBtnRef.current.contains(e.target as Node)
      ) setAvatarMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAvatarMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [avatarMenuOpen]);

  const [duplicateWarning, setDuplicateWarning] = useState<{
    serviceKey: string;
    applications: Array<{ arn: string; state_id: string; created_at: string }>;
    pendingService?: ServiceSummary;
  } | null>(null);
  const [duplicateBanner, setDuplicateBanner] = useState<{
    applications: Array<{ arn: string; state_id: string; created_at: string }>;
  } | null>(null);
  const resumeHydratedRef = useRef<string | null>(null);

  /** Confirm before navigating away from a dirty form. */
  const confirmNavigation = useCallback((): boolean => {
    if (!formDirty) return true;
    return window.confirm(t("common.unsaved_confirm"));
  }, [formDirty]);

  /** Push current view onto nav stack and navigate to a new view. */
  const navigateTo = useCallback((nextView: ViewId, nextDashboard: boolean) => {
    if (!confirmNavigation()) return;
    setFormDirty(false);
    setFormStep("form");
    setAvatarMenuOpen(false);
    navStackRef.current.push({ view, showDashboard });
    setView(nextView);
    setShowDashboard(nextDashboard);
  }, [view, showDashboard, confirmNavigation]);

  /** Pop the nav stack and return to the previous view. Falls back to dashboard. */
  const navigateBack = useCallback(() => {
    if (!confirmNavigation()) return;
    setFormDirty(false);
    const prev = navStackRef.current.pop();
    if (prev) {
      setView(prev.view);
      setShowDashboard(prev.showDashboard);
    } else {
      setView("catalog");
      setShowDashboard(true);
    }
  }, [confirmNavigation]);

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
        const cached = readCached<{ applicant?: Record<string, unknown>; addresses?: Record<string, unknown>; completeness?: { isComplete?: boolean; missingFields?: string[] } }>(key, {
          schema: CACHE_SCHEMAS.profile,
          maxAgeMs: CACHE_TTL_MS.profile,
          validate: isProfilePayload
        });
        if (cached) {
          setProfileApplicant(cached.data.applicant || {});
          setProfileAddresses(cached.data.addresses || {});
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
      setProfileAddresses(data.addresses || {});
      setProfileComplete(Boolean(data.completeness?.isComplete));
      setProfileMissingFields(data.completeness?.missingFields || []);
      setProfileVerification(data.verification || {});
      setProfileCompleteness(data.completeness || null);
      writeCached(key, data, { schema: CACHE_SCHEMAS.profile });
      markSync();
    } catch {
      const cached = readCached<{ applicant?: Record<string, unknown>; addresses?: Record<string, unknown>; completeness?: { isComplete?: boolean; missingFields?: string[] } }>(key, {
        schema: CACHE_SCHEMAS.profile,
        maxAgeMs: CACHE_TTL_MS.profile,
        validate: isProfilePayload
      });
      if (cached) {
        setProfileApplicant(cached.data.applicant || {});
        setProfileAddresses(cached.data.addresses || {});
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

  const handleProfileUpdate = useCallback((section: string) => {
    setProfileUpdateSection(section);
    navigateTo("profile-update", false);
  }, [navigateTo]);

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
  // PERF-007: Consolidated initial + reconnection data loading (was two separate effects)
  useEffect(() => {
    if (!user) return;
    loadCitizenProperties();
    loadCitizenDocuments();
    if (isOffline) return;
    loadServices();
    loadUserApplications();
    loadProfile();
    if (currentApplication?.arn) {
      loadApplicationDetail(currentApplication.arn);
    }
  }, [user, isOffline, currentApplication?.arn, loadServices, loadUserApplications, loadProfile, loadCitizenProperties, loadCitizenDocuments, loadApplicationDetail]);

  // Post-login: redirect to onboarding if profile incomplete and not onboarded
  useEffect(() => {
    if (!user || profileLoading || onboardingRedirectDone.current) return;
    if (!profileVerification.onboarding_completed_at && !profileComplete) {
      onboardingRedirectDone.current = true;
      setView("profile");
      setShowDashboard(false);
      showToast("info", "Complete your profile to start applying for services");
    }
  }, [user, profileLoading, profileVerification, profileComplete, showToast]);

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

        // Merge profile addresses into form address section
        const existingAddress = prev?.address || {};
        const mergedAddress = { ...existingAddress };
        if (profileAddresses?.permanent) {
          mergedAddress.permanent = { ...(existingAddress.permanent || {}), ...profileAddresses.permanent };
        }
        if (profileAddresses?.communication) {
          mergedAddress.communication = { ...(existingAddress.communication || {}), ...profileAddresses.communication };
          // When "same as permanent" is checked, fill communication fields from permanent
          if (mergedAddress.communication.same_as_permanent && mergedAddress.permanent) {
            const { same_as_permanent, ...rest } = mergedAddress.communication;
            const filled = { same_as_permanent };
            for (const [k, v] of Object.entries(mergedAddress.permanent)) {
              (filled as any)[k] = rest[k] != null && rest[k] !== "" ? rest[k] : v;
            }
            mergedAddress.communication = filled;
          }
        }

        return { ...prev, applicant: mergedApplicant, address: mergedAddress };
      });
    }
  }, [user, view, profileApplicant, profileAddresses]);

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

  // Duplicate check when UPN is selected for property-linked services
  useEffect(() => {
    if (view !== "create" || !selectedService || isOffline) {
      setDuplicateBanner(null);
      return;
    }
    const propertyRequired = selectedService.submissionValidation?.propertyRequired !== false;
    if (!propertyRequired) return; // person-linked checked at Apply Now
    const upn = formData?.property?.upn as string | undefined;
    if (!upn) {
      setDuplicateBanner(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/applications/check-duplicate`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ serviceKey: selectedService.serviceKey, propertyUpn: upn }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.hasDuplicate && data.existingApplications?.length > 0) {
            setDuplicateBanner({ applications: data.existingApplications });
          } else if (!cancelled) {
            setDuplicateBanner(null);
          }
        }
      } catch {
        // non-blocking
      }
    })();
    return () => { cancelled = true; };
  }, [view, selectedService, formData?.property?.upn, isOffline, authHeaders]);

  // PERF-007: Removed — consolidated into the single data-loading effect above.

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

  // Offline draft sync: flush queued drafts when coming back online
  useEffect(() => {
    if (isOffline || !user) return;
    const unsyncedDrafts = readOfflineDrafts().filter(d => !d.synced);
    if (unsyncedDrafts.length === 0) return;

    let cancelled = false;
    (async () => {
      let syncedCount = 0;
      for (const draft of unsyncedDrafts) {
        if (cancelled) break;
        try {
          const res = await fetch(`${apiBaseUrl}/api/v1/applications`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              authorityId: draft.formData?.authority_id || "PUDA",
              serviceKey: draft.serviceKey,
              data: draft.formData,
              userId: user.user_id,
            }),
          });
          if (res.ok) {
            removeOfflineDraft(draft.id);
            syncedCount++;
          } else {
            markOfflineDraftSynced(draft.id);
          }
        } catch {
          // Network still flaky, stop trying
          break;
        }
      }
      if (syncedCount > 0 && !cancelled) {
        showToast("success", t("offline.synced_count", { count: syncedCount }));
      }
      if (!cancelled) {
        setPendingSyncCount(getUnsyncedDraftCount());
      }
    })();

    return () => { cancelled = true; };
  }, [isOffline, user]);

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
    if (!cached) {
      // Apply default landing page preference
      const landing = preferences.defaultLandingPage;
      if (landing === "services") {
        setView("catalog");
        setShowDashboard(false);
      } else if (landing === "applications") {
        setView("applications");
        setShowDashboard(false);
      } else if (landing === "locker") {
        setView("locker");
        setShowDashboard(false);
      }
      // "dashboard" is the default — no change needed
      return;
    }
    const snapshot = cached.data;
    setView(snapshot.view || "catalog");
    setShowDashboard(Boolean(snapshot.showDashboard));
    setSelectedService(snapshot.selectedService || null);
    setCurrentApplication(snapshot.currentApplication || null);
    setFormData(snapshot.formData || {});
    // Session restoration is silent — no feedback banner needed
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

  // PERF-026: Lazy-load secondary locale bundle when language preference changes
  useEffect(() => {
    if (preferences.language && preferences.language !== "none") {
      ensureLocaleLoaded(preferences.language);
    }
  }, [preferences.language]);

  // Bridge preferences → theme system
  useEffect(() => {
    if (preferences.theme !== theme) {
      setTheme(preferences.theme);
    }
  }, [preferences.theme]);

  // Bridge preferences → reduce-motion data attribute
  useEffect(() => {
    if (preferences.reduceAnimations) {
      document.documentElement.dataset.reduceMotion = "true";
    } else {
      delete document.documentElement.dataset.reduceMotion;
    }
  }, [preferences.reduceAnimations]);

  // Bridge preferences → high-contrast data attribute
  useEffect(() => {
    if (preferences.contrastMode === "high") {
      document.documentElement.dataset.contrast = "high";
    } else {
      delete document.documentElement.dataset.contrast;
    }
  }, [preferences.contrastMode]);

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

  const pageTitle = useMemo(() => {
    if (showDashboard && view === "catalog") return "Dashboard";
    if (view === "catalog") return t("nav.services");
    if (view === "create") return selectedService?.displayName || "New Application";
    if (view === "track") return "Application Details";
    if (view === "applications") return "My Applications";
    if (view === "locker") return "Document Locker";
    if (view === "settings") return "Settings";
    if (view === "profile") return t("nav.profile");
    if (view === "guide") return t("nav.guide");
    if (view === "complaints") return t("complaints.title");
    return "PUDA";
  }, [view, showDashboard, selectedService, t]);

  const handleDrawerNav = useCallback((target: ViewId, dashboard: boolean) => {
    setDrawerOpen(false);
    if (view === target && showDashboard === dashboard) return;
    navigateTo(target, dashboard);
  }, [view, showDashboard, navigateTo]);

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
        {t("nav.logout")}
      </Button>
    </div>
  );

  const renderResilienceBanner = () => {
    const timestamp = lastSyncAt ? new Date(lastSyncAt).toLocaleString() : null;
    if (isOffline) {
      return (
        <Alert variant="warning" className="view-feedback">
          {t("common.offline_banner")}
          {timestamp ? ` ${t("common.offline_cached", { time: timestamp })}` : ""}
        </Alert>
      );
    }
    if (usingStaleData) {
      return (
        <Alert variant="info" className="view-feedback">
          {t("common.stale_data", { time: timestamp || "" })}
        </Alert>
      );
    }
    if (pendingSyncCount > 0 && !isOffline) {
      return (
        <Alert variant="info" className="view-feedback">
          {t("offline.pending_count", { count: pendingSyncCount })}
        </Alert>
      );
    }
    return null;
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
    return (
      <SecondaryLanguageProvider lang={preferences.language}>
        <Login />
      </SecondaryLanguageProvider>
    );
  }

  const renderNavContent = (context: "sidebar" | "drawer") => {
    const handleNav = context === "drawer"
      ? handleDrawerNav
      : (target: ViewId, dashboard: boolean) => {
          if (view === target && showDashboard === dashboard) return;
          navigateTo(target, dashboard);
        };
    const idSuffix = context === "drawer" ? "drawer" : "sidebar";
    return (
      <>
        <div className="sidebar__header">
          <div className="sidebar__portal-name"><Bilingual tKey="nav.portal_name" /></div>
          <div className="sidebar__user-name">{user.name}</div>
        </div>
        <ul className="sidebar__nav">
          <li>
            <button type="button" className={`sidebar__item ${showDashboard && view === "catalog" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("catalog", true)} title={t("nav.dashboard")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </span>
              <Bilingual tKey="nav.dashboard" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${view === "profile" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("profile", false)} title={t("nav.profile")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <Bilingual tKey="nav.profile" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${!showDashboard && view === "catalog" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("catalog", false)} title={t("nav.services")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </span>
              <Bilingual tKey="nav.services" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${view === "applications" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("applications", false)} title={t("nav.applications")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </span>
              <Bilingual tKey="nav.applications" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${view === "locker" ? "sidebar__item--active" : ""}`} onClick={() => { setLockerFilter(undefined); handleNav("locker", false); }} title={t("nav.locker")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <Bilingual tKey="nav.locker" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${view === "guide" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("guide", false)} title={t("nav.guide")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              </span>
              <Bilingual tKey="nav.guide" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${view === "complaints" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("complaints", false)} title={t("nav.complaints")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <Bilingual tKey="nav.complaints" />
            </button>
          </li>
          <li>
            <button type="button" className={`sidebar__item ${view === "settings" ? "sidebar__item--active" : ""}`} onClick={() => handleNav("settings", false)} title={t("nav.settings")}>
              <span className="sidebar__item-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </span>
              <Bilingual tKey="nav.settings" />
            </button>
          </li>
        </ul>
        <div className="sidebar__divider" />
        <div className="sidebar__footer">
          <button type="button" className="sidebar__item" onClick={() => { if (context === "drawer") setDrawerOpen(false); handleLogout(); }} title={t("nav.logout")}>
            <span className="sidebar__item-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </span>
            {t("nav.logout")}
          </button>
        </div>
      </>
    );
  };

  // App Shell: app bar + persistent sidebar (desktop) + drawer (mobile)
  const appShell = (mainContent: React.ReactNode) => (
    <SecondaryLanguageProvider lang={preferences.language}>
      <header className="app-bar">
        <div className="app-bar__inner">
          <button
            className="app-bar__hamburger app-bar__hamburger--desktop-only"
            onClick={() => updatePreference("sidebarCollapsed", !preferences.sidebarCollapsed)}
            aria-label={preferences.sidebarCollapsed ? "Expand menu" : "Collapse menu"}
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="app-bar__brand">
            <svg className="app-bar__logo" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="19" fill="var(--color-brand)" stroke="var(--color-brand)" strokeWidth="1" />
              <circle cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeWidth="0.8" />
              <text x="20" y="16" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="system-ui, sans-serif">PUDA</text>
              <text x="20" y="23" textAnchor="middle" fill="#fff" fontSize="3.2" fontFamily="system-ui, sans-serif">PUNJAB URBAN</text>
              <text x="20" y="27" textAnchor="middle" fill="#fff" fontSize="3.2" fontFamily="system-ui, sans-serif">DEVELOPMENT</text>
              <text x="20" y="31" textAnchor="middle" fill="#fff" fontSize="3.2" fontFamily="system-ui, sans-serif">AUTHORITY</text>
            </svg>
            <div className="app-bar__brand-text">
              <span className="app-bar__brand-name">PUDA Citizen Portal</span>
              <span className="app-bar__page-title">{pageTitle}</span>
            </div>
          </div>
          <div className="app-bar__avatar-wrap" style={{ position: "relative" }}>
            <button ref={avatarBtnRef} className="app-bar__avatar"
              onClick={() => setAvatarMenuOpen(p => !p)}
              aria-label="User menu" aria-expanded={avatarMenuOpen} type="button">
              {user.name.charAt(0).toUpperCase()}
            </button>
            {avatarMenuOpen && (
              <div ref={avatarMenuRef} className="avatar-menu">
                <div className="avatar-menu__header">
                  <span className="avatar-menu__initial">{user.name.charAt(0).toUpperCase()}</span>
                  <span className="avatar-menu__name">{user.name}</span>
                </div>
                <div className="avatar-menu__divider" />
                <button className="avatar-menu__item" type="button"
                  onClick={() => { setAvatarMenuOpen(false); navigateTo("profile", false); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <Bilingual tKey="nav.profile" />
                </button>
                <button className="avatar-menu__item" type="button"
                  onClick={() => { setAvatarMenuOpen(false); navigateTo("settings", false); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  <Bilingual tKey="nav.settings" />
                </button>
                <div className="avatar-menu__divider" />
                <button className="avatar-menu__item avatar-menu__item--danger" type="button"
                  onClick={() => { setAvatarMenuOpen(false); handleLogout(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  <Bilingual tKey="nav.logout" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Desktop: persistent sidebar (hidden on mobile via CSS) */}
      <aside className={`sidebar${preferences.sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        {renderNavContent("sidebar")}
      </aside>

      {/* Mobile: overlay drawer (portal renders outside #root) */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {renderNavContent("drawer")}
      </Drawer>

      {/* Mobile: persistent bottom navigation */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={`bottom-nav__tab${showDashboard && view === "catalog" ? " bottom-nav__tab--active" : ""}`}
          type="button" onClick={() => { if (!(showDashboard && view === "catalog")) navigateTo("catalog", true); }}>
          <svg className="bottom-nav__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span className="bottom-nav__label"><Bilingual tKey="nav.dashboard" /></span>
        </button>
        <button className={`bottom-nav__tab${!showDashboard && view === "catalog" ? " bottom-nav__tab--active" : ""}`}
          type="button" onClick={() => { if (!(!showDashboard && view === "catalog")) navigateTo("catalog", false); }}>
          <svg className="bottom-nav__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span className="bottom-nav__label"><Bilingual tKey="nav.services" /></span>
        </button>
        <button className={`bottom-nav__tab${view === "applications" ? " bottom-nav__tab--active" : ""}`}
          type="button" onClick={() => { if (view !== "applications") navigateTo("applications", false); }}>
          <svg className="bottom-nav__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span className="bottom-nav__label"><Bilingual tKey="nav.applications" /></span>
        </button>
        <button className={`bottom-nav__tab${view === "locker" ? " bottom-nav__tab--active" : ""}`}
          type="button" onClick={() => { if (view !== "locker") { setLockerFilter(undefined); navigateTo("locker", false); } }}>
          <svg className="bottom-nav__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span className="bottom-nav__label"><Bilingual tKey="nav.locker" /></span>
        </button>
        <button className={`bottom-nav__tab${drawerOpen ? " bottom-nav__tab--active" : ""}`}
          type="button" onClick={() => setDrawerOpen(true)}>
          <svg className="bottom-nav__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <span className="bottom-nav__label"><Bilingual tKey="nav.more" /></span>
        </button>
      </nav>

      <div className={`app-layout${preferences.sidebarCollapsed ? " app-layout--sidebar-collapsed" : ""}`}>
        <div className="app-layout__main">
          {mainContent}
        </div>
      </div>
    </SecondaryLanguageProvider>
  );

  // Show dashboard by default after login
  if (showDashboard && view === "catalog") {
    return appShell(
      <div className="page">
        <a href="#citizen-main-dashboard" className="skip-link">
          {t("common.skip_to_main")}
        </a>
        <main id="citizen-main-dashboard" role="main">
          <h1><Bilingual tKey="dashboard.title" /></h1>
          <p className="subtitle">{t("dashboard.welcome", { name: user.name })}</p>
          <Suspense fallback={<div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /></div>}>
            <Dashboard
              onNavigateToCatalog={() => {
                setError(null);
                setFeedback(null);
                navigateTo("catalog", false);
              }}
              onNavigateToApplication={async (arn) => {
                setError(null);
                setFeedback(null);
                if (arn) {
                  await openApplication(arn);
                } else {
                  navigateTo("applications", false);
                }
              }}
              onNavigateToApplications={(filter) => {
                setError(null);
                setFeedback(null);
                setAppStatusFilter(filter === "active" ? "In Progress" : filter === "approved" ? "Approved" : "");
                navigateTo("applications", false);
              }}
              onNavigateToLocker={(filter?: string) => {
                setError(null);
                setFeedback(null);
                setLockerFilter(filter);
                navigateTo("locker", false);
              }}
              onNavigateToComplaints={() => {
                setError(null);
                setFeedback(null);
                navigateTo("complaints", false);
              }}
              onNavigateToProfile={() => {
                setError(null);
                setFeedback(null);
                navigateTo("profile", false);
              }}
              profileCompleteness={profileCompleteness}
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
      navigateTo("track", false);
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
      const draftId = currentApplication?.arn || crypto.randomUUID();
      writeOfflineDraft({
        id: draftId,
        serviceKey: selectedService.serviceKey,
        formData,
        savedAt: new Date().toISOString(),
        synced: false,
      });
      showToast("info", t("offline.draft_saved_locally"));
      setFeedback({ variant: "info", text: t("offline.draft_saved_locally") });
      setFormDirty(false);
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
      setSubmissionConfirmation({
        arn: result.submittedArn,
        serviceName: selectedService ? getServiceDisplayName(selectedService.serviceKey) : "",
        submittedAt: new Date().toISOString(),
      });
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

    // Duplicate check for person-linked services (propertyRequired === false)
    const propertyRequired = service.submissionValidation?.propertyRequired !== false;
    if (!propertyRequired) {
      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/applications/check-duplicate`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ serviceKey: service.serviceKey }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hasDuplicate && data.existingApplications?.length > 0) {
            setDuplicateWarning({
              serviceKey: service.serviceKey,
              applications: data.existingApplications,
              pendingService: service,
            });
            return;
          }
        }
      } catch {
        // Non-blocking: proceed even if check fails
      }
    }

    proceedToCreate(service);
  };

  const proceedToCreate = (service: ServiceSummary) => {
    setSelectedService(service);
    setServiceConfig(null);
    setError(null);
    setFeedback(null);
    setDuplicateBanner(null);
    setDuplicateWarning(null);
    setConfigLoading(true);
    loadServiceConfig(service.serviceKey).then(() => {
      navigateTo("create", false);
    }).finally(() => {
      setConfigLoading(false);
    });
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

  // Upload directly to Document Locker (no ARN needed — used in create view)
  const handleLockerUpload = async (docTypeId: string, file: File) => {
    if (!user) return;
    if (isOffline) {
      showToast("warning", "You are offline. Document upload is unavailable.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("docTypeId", docTypeId);
      form.append("file", file);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${apiBaseUrl}/api/v1/citizens/me/documents/upload`);
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

      await loadCitizenDocuments();
      showToast("success", `Document uploaded to your locker for ${docTypeId}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showToast("error", msg);
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
          navigateTo("track", false);
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
        navigateTo("track", false);
        markStaleData(cached.fetchedAt, isOffline ? "offline" : "error", "application_open");
        return;
      }
      throw new Error("Application details are unavailable offline.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load application");
      setFeedback(null);
    }
  }

  const hasDocumentTypes = !!(serviceConfig?.documents?.documentTypes?.length);

  // Compute NDC-specific FormRenderer props so we can conditionally override submitLabel after
  const ndcFormProps: Record<string, any> = selectedService?.serviceKey === "no_due_certificate"
    ? (() => {
        if (isOffline) return {};
        if (!formData?.property?.upn) {
          return { submitDisabled: true, submitLabel: t("create.select_property") };
        }
        if (ndcPaymentStatusLoading) {
          return { submitDisabled: true, submitLabel: t("create.loading_payment") };
        }
        if (!ndcPaymentStatus) {
          return { submitDisabled: true, submitLabel: t("create.payment_unavailable") };
        }
        if (!ndcPaymentStatus.certificateEligible) {
          return {
            submitOverride: (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--color-warning, #f59e0b)", fontWeight: 500 }}>
                  {t("create.clear_dues")}
                </span>
                <button
                  type="button"
                  className="form-action-btn form-action-btn--primary"
                  disabled
                  title="Pay all dues using the Pay Now buttons in the ledger above"
                >
                  {t("create.submit_dues_pending")}
                </button>
              </div>
            ),
          };
        }
        return { submitLabel: t("create.submit_get_cert") };
      })()
    : {};

  const ndcPaymentStatusPanel =
    selectedService?.serviceKey === "no_due_certificate" ? (
      <section className="ndc-payment-panel" id="ndc-payment-status-panel">
        <h3>{t("ndc.payment_status")}</h3>
        {!formData?.property?.upn ? (
          <Alert variant="info">{t("ndc.select_upn")}</Alert>
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
              {t("ndc.allotment_info", { date: ndcPaymentStatus.allotmentDate || "—", value: formatCurrency(ndcPaymentStatus.propertyValue), rate: ndcPaymentStatus.annualInterestRatePct, dcf: ndcPaymentStatus.dcfRatePct })}
            </p>
            <div className="ndc-payment-summary">
              <Card className="ndc-payment-kpi">
                <span>{t("ndc.total_due")}</span>
                <strong>{formatCurrency(ndcPaymentStatus.totals.totalDueAmount)}</strong>
              </Card>
              <Card className="ndc-payment-kpi">
                <span>{t("ndc.total_paid")}</span>
                <strong>{formatCurrency(ndcPaymentStatus.totals.paidAmount)}</strong>
              </Card>
              <Card className="ndc-payment-kpi">
                <span>{t("ndc.pending_balance")}</span>
                <strong>{formatCurrency(ndcPaymentStatus.totals.balanceAmount)}</strong>
              </Card>
            </div>
            {ndcPaymentStatus.certificateEligible ? (
              <Alert variant="success">
                {t("ndc.certificate_eligible", { upn: ndcPaymentStatus.propertyUpn })}
              </Alert>
            ) : (
              <Alert variant="warning">
                {t("ndc.dues_pending")}
              </Alert>
            )}
            <div className="ndc-payment-table-wrap">
              <table className="ndc-payment-table">
                <thead>
                  <tr>
                    <th>{t("ndc.due_type")}</th>
                    <th>{t("ndc.due_date")}</th>
                    <th>{t("ndc.payment_date")}</th>
                    <th>{t("ndc.delay_days")}</th>
                    <th>{t("ndc.base")}</th>
                    <th>{t("ndc.interest")}</th>
                    <th>{t("ndc.total")}</th>
                    <th>{t("ndc.paid")}</th>
                    <th>{t("ndc.balance")}</th>
                    <th>{t("ndc.status")}</th>
                    <th>{t("ndc.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ndcPaymentStatus.dues.map((due) => (
                    <tr key={due.dueCode}>
                      <td data-label="Due Type">{due.label}</td>
                      <td data-label="Due Date">{due.dueDate}</td>
                      <td data-label="Payment Date">{due.paymentDate || "—"}</td>
                      <td data-label="Delay (Days)">{due.daysDelayed}</td>
                      <td data-label="Base">{formatCurrency(due.baseAmount)}</td>
                      <td data-label="Interest">{formatCurrency(due.interestAmount)}</td>
                      <td data-label="Total">{formatCurrency(due.totalDueAmount)}</td>
                      <td data-label="Paid">{formatCurrency(due.paidAmount)}</td>
                      <td data-label="Balance">{formatCurrency(due.balanceAmount)}</td>
                      <td data-label="Status">{due.status}</td>
                      <td data-label="Action">
                        {due.balanceAmount > 0.01 ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="form-action-btn"
                            onClick={() => void postNdcPaymentByUpn(due.dueCode)}
                            disabled={Boolean(ndcPaymentPostingDueCode)}
                          >
                            {ndcPaymentPostingDueCode === due.dueCode ? t("ndc.posting") : t("ndc.pay_now")}
                          </Button>
                        ) : (
                          t("ndc.paid")
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
    return appShell(
      <div className="page">
        <a href="#citizen-main-create" className="skip-link">
          {t("common.skip_to_main")}
        </a>
        <Breadcrumb items={[
          { label: t("nav.services"), onClick: () => { navigateBack(); setError(null); } },
          { label: selectedService.displayName }
        ]} />
        <h1>{selectedService.displayName}</h1>

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
          {duplicateBanner && duplicateBanner.applications.length > 0 && (
            <Alert variant="warning" className="view-feedback">
              You already have {duplicateBanner.applications.length} in-progress application(s) for this service
              {formData?.property?.upn ? ` and property ${formData.property.upn}` : ""}:
              {duplicateBanner.applications.map((app) => (
                <span key={app.arn} style={{ display: "block", marginTop: "0.25rem" }}>
                  <strong>{app.arn}</strong> — {getStatusLabel(app.state_id)} ({formatDate(app.created_at)})
                  {" "}
                  <Button
                    type="button"
                    variant="ghost"
                    className="ui-btn-ghost"
                    style={{ fontSize: "0.85em", padding: "0 0.25rem" }}
                    onClick={() => void openApplication(app.arn)}
                  >
                    View
                  </Button>
                </span>
              ))}
            </Alert>
          )}
          {!profileLoading && !profileComplete && (
            <Alert variant="warning">
              Profile incomplete. Missing fields: {profileMissingFields.join(", ") || "Unknown fields"}. Please update your profile.
            </Alert>
          )}
          {!configLoading && serviceConfig?.form && (
            <>
              {/* FormRenderer: keep mounted, hide when on documents step */}
              <div style={{ display: formStep === "form" ? "block" : "none" }}>
                <ErrorBoundary fallback={<Alert variant="error">{t("create.form_error")}</Alert>}>
                  <FormRenderer
                    config={serviceConfig.form as FormConfig}
                    initialData={formData}
                    onChange={(data) => { setFormData(data); setFormDirty(true); }}
                    onSubmit={
                      isOffline
                        ? undefined
                        : hasDocumentTypes
                          ? () => setFormStep("documents")
                          : async () => { await createApplication(); }
                    }
                    readOnly={isOffline}
                    citizenProperties={citizenProperties}
                    onLookupUpn={async (upn: string) => {
                      const res = await fetch(
                        `${apiBaseUrl}/api/v1/citizens/me/property-lookup?upn=${encodeURIComponent(upn)}`,
                        { headers: authHeaders() }
                      );
                      if (!res.ok) return null;
                      const json = await res.json();
                      if (json.property) {
                        loadCitizenProperties();
                        return json.property;
                      }
                      return null;
                    }}
                    secondaryLanguage={preferences.language}
                    pageActions={[
                      {
                        pageId: "PAGE_APPLICATION",
                        label: t("profile.title"),
                        onClick: openProfileEditor,
                        disabled: isOffline
                      }
                    ]}
                    pageSupplements={{
                      PAGE_PAYMENT: ndcPaymentStatusPanel
                    }}
                    {...ndcFormProps}
                    {...(hasDocumentTypes && !ndcFormProps.submitDisabled && !ndcFormProps.submitOverride
                      ? { submitLabel: t("docs.next_step") }
                      : {}
                    )}
                    appendSteps={hasDocumentTypes ? [{
                      id: "documents",
                      title: "Required Documents",
                      title_hi: "आवश्यक दस्तावेज़",
                      title_pa: "ਲੋੜੀਂਦੇ ਦਸਤਾਵੇਜ਼",
                      onClick: () => setFormStep("documents"),
                    }] : []}
                  />
                </ErrorBoundary>
                <div className="form-actions-top">
                  <Button
                    onClick={saveDraft}
                    className="save-draft-btn"
                    type="button"
                    variant="secondary"
                    disabled={isOffline || !profileComplete || profileLoading}
                  >
                    {t("create.save_draft")}
                  </Button>
                </div>
              </div>

              {/* Documents step: full-page */}
              {formStep === "documents" && hasDocumentTypes && (
                <div className="doc-step">
                  <div className="doc-step__progress">
                    <Bilingual tKey="docs.step_label" /> — Step {(serviceConfig.form.pages?.length || 0) + 1} of {(serviceConfig.form.pages?.length || 0) + 1}
                  </div>
                  <Suspense fallback={null}>
                    <DocumentUploadPanel
                      mode="preview"
                      documentTypes={serviceConfig.documents.documentTypes}
                      citizenDocuments={citizenDocuments}
                      onDocumentUpload={handleLockerUpload}
                      uploading={uploading}
                      uploadProgress={uploadProgress}
                      isOffline={isOffline}
                    />
                  </Suspense>
                  <div className="doc-step__actions">
                    <Button variant="secondary" onClick={() => setFormStep("form")}>
                      {t("docs.back_to_form")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={saveDraft}
                      disabled={isOffline || !profileComplete || profileLoading}
                    >
                      {t("create.save_draft")}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void createApplication()}
                      disabled={isOffline || !profileComplete || profileLoading}
                    >
                      {t("create.create_application")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {!configLoading && serviceConfig && !serviceConfig.form && !error && (
            <Alert variant="warning">{t("create.form_unavailable")}</Alert>
          )}
        </main>
        <Modal
          open={profileEditorOpen}
          onClose={() => {
            if (!profileEditorSaving) setProfileEditorOpen(false);
          }}
          title={t("profile.title")}
          description={t("profile.description")}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setProfileEditorOpen(false)}
                disabled={profileEditorSaving}
              >
                {t("profile.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void saveProfileDraft()}
                disabled={profileEditorSaving}
              >
                {profileEditorSaving ? t("profile.saving") : t("profile.save")}
              </Button>
            </>
          }
        >
          <div className="profile-editor-grid">
            {profileEditorError ? <Alert variant="error">{profileEditorError}</Alert> : null}
            <Field label={<Bilingual tKey="profile.salutation" />} htmlFor="profile-salutation">
              <Select
                id="profile-salutation"
                value={profileDraft.salutation || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, salutation: e.target.value }))}
              >
                <option value="">{t("profile.select")}</option>
                <option value="MR">{t("profile.mr")}</option>
                <option value="MS">{t("profile.ms")}</option>
                <option value="MRS">{t("profile.mrs")}</option>
              </Select>
            </Field>
            <Field label={<Bilingual tKey="profile.first_name" />} htmlFor="profile-first-name" required>
              <Input
                id="profile-first-name"
                value={profileDraft.first_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.middle_name" />} htmlFor="profile-middle-name">
              <Input
                id="profile-middle-name"
                value={profileDraft.middle_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, middle_name: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.last_name" />} htmlFor="profile-last-name" required>
              <Input
                id="profile-last-name"
                value={profileDraft.last_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.full_name" />} htmlFor="profile-full-name" required>
              <Input
                id="profile-full-name"
                value={profileDraft.full_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.father_name" />} htmlFor="profile-father-name" required>
              <Input
                id="profile-father-name"
                value={profileDraft.father_name || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, father_name: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.gender" />} htmlFor="profile-gender" required>
              <Select
                id="profile-gender"
                value={profileDraft.gender || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, gender: e.target.value }))}
              >
                <option value="">{t("profile.select")}</option>
                <option value="MALE">{t("profile.male")}</option>
                <option value="FEMALE">{t("profile.female")}</option>
                <option value="OTHER">{t("profile.other")}</option>
              </Select>
            </Field>
            <Field label={<Bilingual tKey="profile.marital_status" />} htmlFor="profile-marital-status" required>
              <Select
                id="profile-marital-status"
                value={profileDraft.marital_status || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, marital_status: e.target.value }))}
              >
                <option value="">{t("profile.select")}</option>
                <option value="SINGLE">{t("profile.single")}</option>
                <option value="MARRIED">{t("profile.married")}</option>
              </Select>
            </Field>
            <Field label={<Bilingual tKey="profile.dob" />} htmlFor="profile-dob" required>
              <Input
                id="profile-dob"
                type="date"
                value={profileDraft.date_of_birth || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, date_of_birth: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.aadhaar" />} htmlFor="profile-aadhaar" required>
              <Input
                id="profile-aadhaar"
                value={profileDraft.aadhaar || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, aadhaar: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.pan" />} htmlFor="profile-pan" required>
              <Input
                id="profile-pan"
                value={profileDraft.pan || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, pan: e.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.email" />} htmlFor="profile-email" required>
              <Input
                id="profile-email"
                type="email"
                value={profileDraft.email || ""}
                onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))}
              />
            </Field>
            <Field label={<Bilingual tKey="profile.mobile" />} htmlFor="profile-mobile" required>
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
    return appShell(
      <Suspense fallback={<div className="page"><div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="2rem" width="50%" /><SkeletonBlock height="4rem" /><SkeletonBlock height="4rem" /></div></div>}>
      {submissionConfirmation && (
        <div className="submission-confirmation">
          <div className="submission-confirmation__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h2 className="submission-confirmation__title"><Bilingual tKey="confirm.title" /></h2>
          <div className="submission-confirmation__details">
            <div className="submission-confirmation__row">
              <span className="submission-confirmation__label"><Bilingual tKey="confirm.arn_label" /></span>
              <span className="submission-confirmation__value submission-confirmation__arn">{submissionConfirmation.arn}</span>
            </div>
            {submissionConfirmation.serviceName && (
              <div className="submission-confirmation__row">
                <span className="submission-confirmation__label"><Bilingual tKey="app_detail.service" /></span>
                <span className="submission-confirmation__value">{submissionConfirmation.serviceName}</span>
              </div>
            )}
            <div className="submission-confirmation__row">
              <span className="submission-confirmation__label"><Bilingual tKey="confirm.submitted_at" /></span>
              <span className="submission-confirmation__value">{new Date(submissionConfirmation.submittedAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="submission-confirmation__next">
            <h3><Bilingual tKey="confirm.what_next" /></h3>
            <ol className="submission-confirmation__steps">
              <li>{t("confirm.step1")}</li>
              <li>{t("confirm.step2")}</li>
              <li>{t("confirm.step3")}</li>
            </ol>
          </div>
          <Button variant="primary" onClick={() => setSubmissionConfirmation(null)}>
            {t("confirm.view_application")}
          </Button>
        </div>
      )}
      {!submissionConfirmation && <ApplicationDetail
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
          setCurrentApplication(null);
          setApplicationDetail(null);
          navigateBack();
        }}
        onSubmit={currentApplication.state_id === "DRAFT" ? submitApplication : undefined}
        onDocumentUpload={handleDocumentUpload}
        onReuseDocument={handleReuseDocument}
        citizenDocuments={citizenDocuments}
        uploading={uploading}
        uploadProgress={uploadProgress}
        isOffline={isOffline}
        staleAt={lastSyncAt}
      />}
      </Suspense>
    );
  }

  // Profile / Onboarding View
  if (view === "profile") {
    const hasProfileData = Boolean(profileApplicant.full_name || profileApplicant.first_name || profileApplicant.aadhaar || profileApplicant.email);
    const showProfileView = Boolean(profileVerification.onboarding_completed_at) || hasProfileData;
    return appShell(
      <div className="page">
        <a href="#citizen-main-profile" className="skip-link">{t("common.skip_to_main")}</a>
        <h1>{showProfileView ? t("nav.profile") : t("profile.complete_profile")}</h1>
        {!showProfileView && <p className="subtitle">{t("profile.complete_subtitle")}</p>}
        <main id="citizen-main-profile" className="panel" role="main">
          <Suspense fallback={<div style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="2rem" width="50%" /><SkeletonBlock height="4rem" /><SkeletonBlock height="4rem" /></div>}>
            {showProfileView ? (
              <ProfileSummaryLazy
                applicant={profileApplicant}
                addresses={profileAddresses}
                verification={profileVerification}
                completeness={profileCompleteness}
                onUpdate={handleProfileUpdate}
                onReVerifyAadhaar={() => {
                  setProfileVerification((prev: any) => ({ ...prev, onboarding_completed_at: undefined, aadhaar_verified: false }));
                }}
                onReVerifyPan={() => {
                  setProfileVerification((prev: any) => ({ ...prev, onboarding_completed_at: undefined, pan_verified: false }));
                }}
              />
            ) : (
              <Onboarding
                applicant={profileApplicant}
                addresses={profileAddresses}
                verification={profileVerification}
                completeness={profileCompleteness}
                onComplete={(data) => {
                  setProfileApplicant(data.applicant || {});
                  setProfileAddresses(data.addresses || {});
                  setProfileComplete(Boolean(data.completeness?.isComplete));
                  setProfileMissingFields(data.completeness?.missingFields || []);
                  setProfileVerification(data.verification || {});
                  setProfileCompleteness(data.completeness || null);
                  if (user) writeCached(profileCacheKey(user.user_id), data, { schema: CACHE_SCHEMAS.profile });
                  showToast("success", "Profile completed successfully!");
                  navigateTo("catalog", true);
                }}
                onSkip={() => {
                  navigateTo("catalog", true);
                }}
              />
            )}
          </Suspense>
        </main>
      </div>
    );
  }

  // Profile Update (placeholder)
  if (view === "profile-update") {
    const sectionLabel = profileUpdateSection
      ? t(`profile.section_${profileUpdateSection}`)
      : t("nav.profile");
    return appShell(
      <div className="page">
        <a href="#citizen-main-profile-update" className="skip-link">{t("common.skip_to_main")}</a>
        <h1>{t("profile.update_title", { section: sectionLabel })}</h1>
        <main id="citizen-main-profile-update" className="panel" role="main">
          <Card style={{ textAlign: "center", padding: "var(--space-8) var(--space-5)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "var(--space-3)" }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "1.1rem" }}>{t("profile.update_coming_title")}</h2>
            <p style={{ color: "var(--color-text-subtle)", fontSize: "0.9rem", margin: "0 0 var(--space-4)" }}>{t("profile.update_coming_desc")}</p>
            <Button variant="secondary" onClick={navigateBack}>{t("profile.update_back")}</Button>
          </Card>
        </main>
      </div>
    );
  }

  // Citizen Guide View
  if (view === "guide") {
    return appShell(
      <div className="page">
        <a href="#citizen-main-guide" className="skip-link">{t("common.skip_to_main")}</a>
        <h1><Bilingual tKey="nav.guide" /></h1>
        <p className="subtitle">{t("guide.subtitle")}</p>
        <main id="citizen-main-guide" className="panel" role="main">
          <Card style={{ textAlign: "center", padding: "var(--space-8) var(--space-5)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "var(--space-3)" }}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "1.1rem" }}>{t("guide.coming_soon_title")}</h2>
            <p style={{ color: "var(--color-text-subtle)", fontSize: "0.9rem", margin: 0 }}>{t("guide.coming_soon_desc")}</p>
          </Card>
        </main>
      </div>
    );
  }

  // Settings View
  if (view === "settings") {
    return appShell(
      <Suspense fallback={<div className="page"><div className="panel" style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="2rem" width="50%" /><SkeletonBlock height="2.75rem" /><SkeletonBlock height="2.75rem" /></div></div>}>
        <Settings preferences={preferences} onUpdatePreference={updatePreference} />
      </Suspense>
    );
  }

  // Report Complaint View
  if (view === "complaints") {
    return appShell(
      <div className="page">
        <a href="#citizen-main-complaints" className="skip-link">
          {t("common.skip_to_main")}
        </a>
        <h1><Bilingual tKey="complaints.title" /></h1>
        <p className="subtitle">{t("complaints.subtitle")}</p>
        <main id="citizen-main-complaints" className="panel" role="main">
          {renderResilienceBanner()}
          <Suspense fallback={<div style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /></div>}>
            <ReportComplaint
              onBack={() => navigateBack()}
              isOffline={isOffline}
            />
          </Suspense>
        </main>
      </div>
    );
  }

  // Document Locker View
  if (view === "locker") {
    return appShell(
      <div className="page">
        <a href="#citizen-main-locker" className="skip-link">
          {t("common.skip_to_main")}
        </a>
        <h1><Bilingual tKey="locker.title" /></h1>
        <p className="subtitle">{t("locker.subtitle")}</p>
        <main id="citizen-main-locker" className="panel" role="main">
          {renderResilienceBanner()}
          <Suspense fallback={<div style={{display:"grid",gap:"var(--space-3)"}}><SkeletonBlock height="5rem" /><SkeletonBlock height="5rem" /></div>}>
            <DocumentLocker
              onBack={() => {
                setLockerFilter(undefined);
                navigateBack();
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
    return appShell(
      <div className="page">
        <a href="#citizen-main-applications" className="skip-link">
          {t("common.skip_to_main")}
        </a>
        <Button variant="ghost" onClick={navigateBack} className="back-btn" aria-label={t("common.back")}>
          ← {t("common.back")}
        </Button>
        <h1><Bilingual tKey="common.all_applications" /></h1>
        <p className="subtitle">{t("common.manage_applications")}</p>

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
              <h3>{t("dashboard.empty_title")}</h3>
              <p>{t("dashboard.empty_message")}</p>
              <Button
                onClick={() => navigateTo("catalog", false)}
                fullWidth
                className="empty-state-action"
                disabled={isOffline}
              >
                {t("dashboard.apply_now")}
              </Button>
            </div>
          )}
          {!loading && !error && applications.length > 0 && (() => {
            const HIGH_LEVEL_STATUS: Record<string, string> = {
              DRAFT: "Draft",
              SUBMITTED: "Submitted",
              RESUBMITTED: "Submitted",
              PENDING_AT_CLERK: "In Progress",
              PENDING_AT_SR_ASSISTANT: "In Progress",
              PENDING_AT_SR_ASSISTANT_ACCOUNTS: "In Progress",
              PENDING_AT_ACCOUNT_OFFICER: "In Progress",
              PENDING_AT_JUNIOR_ENGINEER: "In Progress",
              PENDING_AT_SDE: "In Progress",
              PENDING_AT_SDO: "In Progress",
              PENDING_AT_SDO_PH: "In Progress",
              PENDING_AT_DRAFTSMAN: "In Progress",
              IN_PROGRESS: "In Progress",
              QUERY_PENDING: "Query Pending",
              APPROVED: "Approved",
              REJECTED: "Rejected",
              CLOSED: "Closed",
            };
            const getHighLevelStatus = (stateId: string) => HIGH_LEVEL_STATUS[stateId] || "In Progress";
            const q = appSearchQuery.trim().toLowerCase();
            const filteredApps = applications.filter((app) => {
              if (appStatusFilter && getHighLevelStatus(app.state_id) !== appStatusFilter) return false;
              if (!q) return true;
              const serviceName = getServiceDisplayName(app.service_key).toLowerCase();
              const arn = app.arn.toLowerCase();
              const status = getHighLevelStatus(app.state_id).toLowerCase();
              return serviceName.includes(q) || arn.includes(q) || status.includes(q);
            });
            const statusOptions = Array.from(new Set(applications.map((a) => getHighLevelStatus(a.state_id)))).sort();
            return (
              <>
                <div className="app-search-bar">
                  <Input
                    placeholder={t("common.search_placeholder")}
                    value={appSearchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppSearchQuery(e.target.value)}
                    aria-label="Search applications"
                  />
                  <Select
                    value={appStatusFilter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAppStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="">{t("common.all_statuses")}</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>
                {filteredApps.length === 0 ? (
                  <div className="empty-state">
                    <h3>{t("common.no_matching")}</h3>
                    <p>{t("common.clear_filters")}</p>
                    <Button variant="ghost" onClick={() => { setAppSearchQuery(""); setAppStatusFilter(""); }}>
                      {t("common.clear_filters")}
                    </Button>
                  </div>
                ) : (
                  <div className="application-cards">
                    {filteredApps.map((app) => (
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
                              {getHighLevelStatus(app.state_id)}
                            </span>
                          </div>
                          <div className="app-card-arn">{app.arn}</div>
                          <div className="app-card-footer">
                            <span className="app-card-date" title={app.submitted_at ? formatDate(app.submitted_at) : formatDate(app.created_at)}>
                              {timeAgo(app.submitted_at || app.created_at)}
                            </span>
                            <span className="app-card-action">{t("common.view_details")} →</span>
                          </div>
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </main>
      </div>
    );
  }

  return appShell(
    <div className="page">
      <a href="#citizen-main-catalog" className="skip-link">
        {t("common.skip_to_main")}
      </a>
      <h1><Bilingual tKey="catalog.title" /></h1>
      <p className="subtitle">{t("catalog.subtitle")}</p>

      <main id="citizen-main-catalog" className="panel" role="main">
        {renderResilienceBanner()}
        {feedback ? <Alert variant={feedback.variant} className="view-feedback">{feedback.text}</Alert> : null}
        {loading && (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {[1, 2, 3, 4].map((i) => <SkeletonBlock key={i} height="5rem" />)}
          </div>
        )}
        {error ? <Alert variant="error">{error}</Alert> : null}
        {!loading && !error && services.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <h3>{t("catalog.no_services")}</h3>
            <p>{t("catalog.no_services_desc")}</p>
          </div>
        )}
        {!loading && services.length > 0 && (
          <div className="catalog-search-bar">
            <svg className="catalog-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <Input
              placeholder={t("catalog.search_placeholder")}
              value={catalogSearch}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCatalogSearch(e.target.value)}
              aria-label={t("catalog.search_placeholder")}
              className="catalog-search-input"
            />
            {catalogSearch && (
              <button type="button" className="catalog-search-clear" onClick={() => setCatalogSearch("")} aria-label={t("common.clear_filters")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}
        {(() => {
          const q = catalogSearch.trim().toLowerCase();
          const filtered = q
            ? services.filter((s) => {
                const tKey = `service.${s.serviceKey}`;
                const en = t(tKey, { lng: "en" }).toLowerCase();
                const hi = t(tKey, { lng: "hi" }).toLowerCase();
                const pa = t(tKey, { lng: "pa" }).toLowerCase();
                return en.includes(q) || hi.includes(q) || pa.includes(q) ||
                  s.displayName.toLowerCase().includes(q) ||
                  s.category.toLowerCase().includes(q) ||
                  s.serviceKey.toLowerCase().includes(q);
              })
            : services;
          if (!loading && services.length > 0 && filtered.length === 0) {
            return (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <h3>{t("catalog.no_results")}</h3>
                <p>{t("catalog.no_results_desc")}</p>
              </div>
            );
          }
          return (
        <ul className="service-list">
          {filtered.map((service) => (
            <li key={service.serviceKey} className="service-card-group">
              <div className="service-card">
                <div>
                  <h2><Bilingual tKey={`service.${service.serviceKey}`} /></h2>
                </div>
                <div className="service-actions">
                  <Button onClick={() => handleStartApplication(service)} className="action-button" disabled={isOffline}>
                    {t("catalog.apply_now")}
                  </Button>
                </div>
              </div>
              {duplicateWarning && duplicateWarning.serviceKey === service.serviceKey && (
                <Alert variant="warning" className="duplicate-inline-alert">
                  <p style={{ marginBottom: "0.5rem" }}>
                    <strong>You already have {duplicateWarning.applications.length} in-progress application(s) for this service.</strong>
                    {" "}You can view an existing one or continue to create a new application.
                  </p>
                  {duplicateWarning.applications.map((app) => (
                    <Button
                      key={app.arn}
                      type="button"
                      variant="ghost"
                      className="duplicate-app-link"
                      onClick={() => void openApplication(app.arn)}
                    >
                      <span><strong>{app.arn}</strong></span>
                      <span className={`status-badge ${getStatusBadgeClass(app.state_id)}`}>
                        {getStatusLabel(app.state_id)}
                      </span>
                      <span style={{ color: "var(--color-text-subtle)", fontSize: "0.85em" }}>
                        {formatDate(app.created_at)}
                      </span>
                      <span className="app-card-action">{t("common.view")} →</span>
                    </Button>
                  ))}
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "0.75rem" }}>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => {
                        if (duplicateWarning.pendingService) {
                          proceedToCreate(duplicateWarning.pendingService);
                        }
                      }}
                    >
                      {t("catalog.duplicate_continue")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setDuplicateWarning(null)}>
                      {t("catalog.dismiss")}
                    </Button>
                  </div>
                </Alert>
              )}
            </li>
          ))}
        </ul>
          );
        })()}
      </main>
    </div>
  );
}
