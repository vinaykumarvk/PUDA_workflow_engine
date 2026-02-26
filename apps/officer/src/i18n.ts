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

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    pa: { translation: pa },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = "en";
export default i18n;
