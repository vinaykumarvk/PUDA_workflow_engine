import { useTranslation } from "react-i18next";
import { Field, Select } from "@puda/shared";
import { SECONDARY_LANGUAGES } from "./i18n";
import { Bilingual } from "./Bilingual";
import type { UserPreferences } from "./preferences";
import "./settings.css";

type Props = {
  preferences: UserPreferences;
  onUpdatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
};

export default function Settings({ preferences, onUpdatePreference }: Props) {
  const { t } = useTranslation();

  return (
    <div className="page">
      <a href="#citizen-main-settings" className="skip-link">
        {t("common.skip_to_main")}
      </a>
      <h1><Bilingual tKey="settings.title" /></h1>
      <p className="subtitle">{t("settings.subtitle")}</p>

      <main id="citizen-main-settings" className="panel" role="main">
        {/* Appearance */}
        <section className="settings-section">
          <h2 className="settings-section__title"><Bilingual tKey="settings.appearance" /></h2>
          <div className="settings-grid">
            <Field label={<Bilingual tKey="settings.theme" />} htmlFor="pref-theme">
              <Select
                id="pref-theme"
                value={preferences.theme}
                onChange={(e) => onUpdatePreference("theme", e.target.value as UserPreferences["theme"])}
              >
                <option value="light">{t("settings.theme_light")}</option>
                <option value="dark">{t("settings.theme_dark")}</option>
                <option value="system">{t("settings.theme_system")}</option>
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
                <option value="off">{t("settings.reduce_off")}</option>
                <option value="on">{t("settings.reduce_on")}</option>
              </Select>
            </Field>
          </div>
        </section>

        {/* Regional */}
        <section className="settings-section">
          <h2 className="settings-section__title"><Bilingual tKey="settings.regional" /></h2>
          <div className="settings-grid">
            <Field label={<Bilingual tKey="settings.secondary_language" />} htmlFor="pref-language">
              <Select
                id="pref-language"
                value={preferences.language}
                onChange={(e) => onUpdatePreference("language", e.target.value as UserPreferences["language"])}
              >
                {SECONDARY_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={<Bilingual tKey="settings.date_format" />} htmlFor="pref-date-format">
              <Select
                id="pref-date-format"
                value={preferences.dateFormat}
                onChange={(e) => onUpdatePreference("dateFormat", e.target.value as UserPreferences["dateFormat"])}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </Select>
            </Field>
          </div>
        </section>

        {/* Navigation */}
        <section className="settings-section">
          <h2 className="settings-section__title"><Bilingual tKey="settings.navigation" /></h2>
          <div className="settings-grid">
            <Field label={<Bilingual tKey="settings.default_landing" />} htmlFor="pref-landing-page">
              <Select
                id="pref-landing-page"
                value={preferences.defaultLandingPage}
                onChange={(e) => onUpdatePreference("defaultLandingPage", e.target.value as UserPreferences["defaultLandingPage"])}
              >
                <option value="dashboard">{t("settings.landing_dashboard")}</option>
                <option value="services">{t("settings.landing_services")}</option>
                <option value="applications">{t("settings.landing_applications")}</option>
                <option value="locker">{t("settings.landing_locker")}</option>
              </Select>
            </Field>
          </div>
        </section>
      </main>
    </div>
  );
}
