import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import hi from "./locales/hi";
import pa from "./locales/pa";

export const SECONDARY_LANGUAGES = [
  { code: "none", label: "None (English only)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
] as const;

// Keep for backward compatibility
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
] as const;

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  pa: { translation: pa },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

document.documentElement.lang = "en";

// Kept for backward compat but is effectively a no-op now since lng stays "en"
export function changeLanguage(code: string) {
  // no-op: English is always the active i18n language
  // Secondary language is handled by SecondaryLanguageContext
  return Promise.resolve();
}

export default i18n;
