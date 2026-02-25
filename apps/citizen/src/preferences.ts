import { useState, useCallback, useEffect, useRef } from "react";

export type UserPreferences = {
  theme: "light" | "dark" | "system";
  sidebarCollapsed: boolean;
  defaultLandingPage: "dashboard" | "services" | "applications" | "locker";
  reduceAnimations: boolean;
  language: "hi" | "pa" | "none";
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD";
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  sidebarCollapsed: false,
  defaultLandingPage: "dashboard",
  reduceAnimations: false,
  language: "none",
  dateFormat: "DD/MM/YYYY",
};

const STORAGE_KEY = "puda_citizen_preferences";
const UPDATED_AT_KEY = "puda_citizen_preferences_updated_at";

function readLocal(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate "en" language to "none" (English is always shown; language selects secondary)
      if (parsed.language === "en") parsed.language = "none";
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch {
    // corrupted — fall through to migration
  }

  // Migrate from old keys on first load
  const prefs = { ...DEFAULT_PREFERENCES };
  const oldTheme = localStorage.getItem("puda_citizen_theme");
  if (oldTheme === "light" || oldTheme === "dark" || oldTheme === "system") {
    prefs.theme = oldTheme;
  }
  const oldLang = localStorage.getItem("puda_lang");
  if (oldLang === "hi" || oldLang === "pa") {
    prefs.language = oldLang;
  }
  // Migrate "en" → "none" from old key
  if (oldLang === "en") {
    prefs.language = "none";
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  return prefs;
}

function writeLocal(prefs: UserPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function usePreferences(
  apiBaseUrl: string,
  authHeaders: () => Record<string, string>,
  userId: string | undefined
) {
  const [preferences, setPreferences] = useState<UserPreferences>(readLocal);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Sync from API on mount (if remote is newer, overwrite local)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/profile/me`, { headers: authHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const remotePrefs = data.preferences;
        const remoteUpdatedAt = data.preferencesUpdatedAt;
        if (!remotePrefs || !remoteUpdatedAt) return;
        const localUpdatedAt = localStorage.getItem(UPDATED_AT_KEY);
        if (!localUpdatedAt || new Date(remoteUpdatedAt) > new Date(localUpdatedAt)) {
          const merged = { ...DEFAULT_PREFERENCES, ...remotePrefs };
          writeLocal(merged);
          localStorage.setItem(UPDATED_AT_KEY, remoteUpdatedAt);
          if (!cancelled && mountedRef.current) {
            setPreferences(merged);
          }
        }
      } catch {
        // non-fatal — keep local prefs
      }
    })();
    return () => { cancelled = true; };
  }, [apiBaseUrl, authHeaders, userId]);

  const updatePreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        writeLocal(next);
        return next;
      });

      // Debounced API sync
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!userId) return;
        const current = readLocal();
        void fetch(`${apiBaseUrl}/api/v1/profile/me`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ preferences: { [key]: value } }),
        }).then((res) => {
          if (res.ok) {
            return res.json().then((data: any) => {
              if (data.preferencesUpdatedAt) {
                localStorage.setItem(UPDATED_AT_KEY, data.preferencesUpdatedAt);
              }
            });
          }
        }).catch(() => {
          // non-fatal
        });
      }, 500);
    },
    [apiBaseUrl, authHeaders, userId]
  );

  return { preferences, updatePreference };
}
