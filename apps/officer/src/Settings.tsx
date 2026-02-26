import { Field, Select } from "@puda/shared";
import { CUSTOM_THEMES } from "./theme";
import { SECONDARY_LANGUAGES } from "./i18n";
import type { OfficerPreferences } from "./preferences";
import "./settings.css";

type Props = {
  preferences: OfficerPreferences;
  onUpdatePreference: <K extends keyof OfficerPreferences>(key: K, value: OfficerPreferences[K]) => void;
};

export default function Settings({ preferences, onUpdatePreference }: Props) {
  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">Customize your workbench experience</p>

      <div className="panel" style={{ marginTop: "var(--space-4)" }}>
        {/* Appearance */}
        <section className="settings-section">
          <h2 className="settings-section__title">Appearance</h2>
          <div className="settings-grid">
            <Field label="Theme" htmlFor="pref-theme">
              <Select
                id="pref-theme"
                value={preferences.theme}
                onChange={(e) => onUpdatePreference("theme", e.target.value as OfficerPreferences["theme"])}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
                {CUSTOM_THEMES.map((ct) => (
                  <option key={ct} value={ct}>{ct.charAt(0).toUpperCase() + ct.slice(1)}</option>
                ))}
              </Select>
            </Field>

            <Field label="Sidebar" htmlFor="pref-sidebar">
              <Select
                id="pref-sidebar"
                value={preferences.sidebarCollapsed ? "collapsed" : "expanded"}
                onChange={(e) => onUpdatePreference("sidebarCollapsed", e.target.value === "collapsed")}
              >
                <option value="expanded">Expanded</option>
                <option value="collapsed">Collapsed</option>
              </Select>
            </Field>

            <Field label="Reduce Animations" htmlFor="pref-reduce-animations">
              <Select
                id="pref-reduce-animations"
                value={preferences.reduceAnimations ? "on" : "off"}
                onChange={(e) => onUpdatePreference("reduceAnimations", e.target.value === "on")}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </Select>
            </Field>

            <Field label="Contrast Mode" htmlFor="pref-contrast">
              <Select
                id="pref-contrast"
                value={preferences.contrastMode}
                onChange={(e) => onUpdatePreference("contrastMode", e.target.value as "normal" | "high")}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
        </section>

        {/* Preferences */}
        <section className="settings-section">
          <h2 className="settings-section__title">Preferences</h2>
          <div className="settings-grid">
            <Field label="Default Landing View" htmlFor="pref-landing-view">
              <Select
                id="pref-landing-view"
                value={preferences.defaultLandingView}
                onChange={(e) => onUpdatePreference("defaultLandingView", e.target.value as OfficerPreferences["defaultLandingView"])}
              >
                <option value="inbox">My Inbox</option>
                <option value="search">Search Applications</option>
                <option value="complaints">Complaint Management</option>
                <option value="service-config">Service Configuration</option>
              </Select>
            </Field>

            <Field label="Date Format" htmlFor="pref-date-format">
              <Select
                id="pref-date-format"
                value={preferences.dateFormat}
                onChange={(e) => onUpdatePreference("dateFormat", e.target.value as OfficerPreferences["dateFormat"])}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </Select>
            </Field>

            <Field label="Secondary Language" htmlFor="pref-language">
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
