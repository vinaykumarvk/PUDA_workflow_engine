import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";

export const SECONDARY_LANGUAGES = [
  { code: "none", label: "None (English only)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
] as const;

// PERF-026: Only load English eagerly; secondary locales loaded on demand
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = "en";

// PERF-026: Lazy-load secondary locale bundles
const localeLoaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  hi: () => import("./locales/hi"),
  pa: () => import("./locales/pa"),
};
const loadedLocales = new Set<string>(["en"]);

/** Ensure a locale's resources are loaded into i18next. Call before rendering Bilingual content. */
export async function ensureLocaleLoaded(lang: string): Promise<void> {
  if (lang === "none" || loadedLocales.has(lang)) return;
  const loader = localeLoaders[lang];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(lang, "translation", mod.default, true, true);
  loadedLocales.add(lang);
}

export default i18n;
