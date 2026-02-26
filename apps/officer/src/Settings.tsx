import { useTranslation } from "react-i18next";
import { Field, Select } from "@puda/shared";
import { Bilingual } from "./Bilingual";
import { CUSTOM_THEMES } from "./theme";
import { SECONDARY_LANGUAGES } from "./i18n";
import type { OfficerPreferences } from "./preferences";
import "./settings.css";

type Props = {
  preferences: OfficerPreferences;
  onUpdatePreference: <K extends keyof OfficerPreferences>(key: K, value: OfficerPreferences[K]) => void;
};

export default function Settings({ preferences, onUpdatePreference }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <h1>{t("app.page_settings")}</h1>
      <p className="subtitle">{t("settings.subtitle")}</p>

      <div className="panel" style={{ marginTop: "var(--space-4)" }}>
        {/* Appearance */}
        <section className="settings-section">
          <h2 className="settings-section__title">{t("settings.appearance")}</h2>
          <div className="settings-grid">
            <Field label={<Bilingual tKey="settings.theme" />} htmlFor="pref-theme">
              <Select
                id="pref-theme"
                value={preferences.theme}
                onChange={(e) => onUpdatePreference("theme", e.target.value as OfficerPreferences["theme"])}
              >
                <option value="light">{t("settings.theme_light")}</option>
                <option value="dark">{t("settings.theme_dark")}</option>
                <option value="system">{t("settings.theme_system")}</option>
                {CUSTOM_THEMES.map((ct) => (
                  <option key={ct} value={ct}>{ct.charAt(0).toUpperCase() + ct.slice(1)}</option>
                ))}
              </Select>
            </Field>

            <Field label={<Bilingual tKey="settings.sidebar" />} htmlFor="pref-sidebar">
              <Select
                id="pref-sidebar"
                value={preferences.sidebarCollapsed ? "collapsed" : "expanded"}
                onChange={(e) => onUpdatePreference("sidebarCollapsed", e.target.value === "collapsed")}
              >
                <option value="expanded">{t("settings.sidebar_expanded")}</option>
                <option value="collapsed">{t("settings.sidebar_collapsed")}</option>
              </Select>
            </Field>

            <Field label={<Bilingual tKey="settings.reduce_animations" />} htmlFor="pref-reduce-animations">
              <Select
                id="pref-reduce-animations"
                value={preferences.reduceAnimations ? "on" : "off"}
                onChange={(e) => onUpdatePreference("reduceAnimations", e.target.value === "on")}
              >
                <option value="off">{t("settings.animations_off")}</option>
                <option value="on">{t("settings.animations_on")}</option>
              </Select>
            </Field>

            <Field label={<Bilingual tKey="settings.contrast" />} htmlFor="pref-contrast">
              <Select
                id="pref-contrast"
                value={preferences.contrastMode}
                onChange={(e) => onUpdatePreference("contrastMode", e.target.value as "normal" | "high")}
              >
                <option value="normal">{t("settings.contrast_normal")}</option>
                <option value="high">{t("settings.contrast_high")}</option>
              </Select>
            </Field>
          </div>
        </section>

        {/* Preferences */}
        <section className="settings-section">
          <h2 className="settings-section__title">{t("settings.preferences")}</h2>
          <div className="settings-grid">
            <Field label={<Bilingual tKey="settings.landing_view" />} htmlFor="pref-landing-view">
              <Select
                id="pref-landing-view"
                value={preferences.defaultLandingView}
                onChange={(e) => onUpdatePreference("defaultLandingView", e.target.value as OfficerPreferences["defaultLandingView"])}
              >
                <option value="inbox">{t("app.page_inbox")}</option>
                <option value="search">{t("app.page_search")}</option>
                <option value="complaints">{t("app.page_complaints")}</option>
                <option value="service-config">{t("app.page_service_config")}</option>
              </Select>
            </Field>

            <Field label={<Bilingual tKey="settings.date_format" />} htmlFor="pref-date-format">
              <Select
                id="pref-date-format"
                value={preferences.dateFormat}
                onChange={(e) => onUpdatePreference("dateFormat", e.target.value as OfficerPreferences["dateFormat"])}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </Select>
            </Field>

            <Field label={<Bilingual tKey="settings.language" />} htmlFor="pref-language">
              <Select
                id="pref-language"
                value={preferences.language}
                onChange={(e) => onUpdatePreference("language", e.target.value as OfficerPreferences["language"])}
              >
                {SECONDARY_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </section>
      </div>
    </>
  );
}
