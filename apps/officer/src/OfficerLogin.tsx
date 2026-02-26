import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Field, Input, PasswordInput } from "@puda/shared";
import { useTheme } from "./theme";
import type { ThemePreference } from "./theme";

interface OfficerLoginProps {
  onLogin: (loginId: string, password: string) => Promise<void>;
}

export default function OfficerLogin({ onLogin }: OfficerLoginProps) {
  const { theme, setTheme } = useTheme("puda_officer_theme");
  const { t } = useTranslation();
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      await onLogin(loginId, loginPassword);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="page">
      <a href="#officer-login-main" className="skip-link">
        Skip to main content
      </a>
      <header className="page__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div>
          <p className="eyebrow">{t("app.brand")}</p>
          <h1>{t("login.title")}</h1>
        </div>
        <select
          className="login-theme-select"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemePreference)}
          aria-label="Theme"
        >
          <option value="light">{t("settings.theme_light")}</option>
          <option value="dark">{t("settings.theme_dark")}</option>
          <option value="system">{t("settings.theme_system")}</option>
        </select>
      </header>
      <main id="officer-login-main" className="panel officer-login-panel" role="main">
        <form onSubmit={handleSubmit} className="officer-login-form">
          {loginError ? <Alert variant="error">{loginError}</Alert> : null}
          <Field label={t("login.user_id")} htmlFor="officer-login-id" required>
            <Input
              id="officer-login-id"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              placeholder={t("login.user_id_placeholder")}
              autoComplete="username"
            />
          </Field>
          <Field label={t("login.password")} htmlFor="officer-login-password" required>
            <PasswordInput
              id="officer-login-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              placeholder={t("login.password_placeholder")}
              autoComplete="current-password"
            />
          </Field>
          <Button
            type="submit"
            disabled={loginLoading}
            fullWidth
          >
            {t(loginLoading ? "login.loading" : "login.submit")}
          </Button>
          {import.meta.env.DEV && (
            <div className="test-credentials">
              <p className="test-credentials__title">Test Credentials (password: password123)</p>
              <p>officer1 = Clerk (all services, first stage)</p>
              <p>officer2 = Sr. Assistant (NDC, second stage)</p>
              <p>officer3 = Account Officer (NDC, final approval)</p>
              <p>officer4 = Junior Engineer (Water/Sewerage)</p>
              <p>officer5 = SDO (Water/Sewerage, final approval)</p>
              <p>officer6 = Draftsman (Architect, final approval)</p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
