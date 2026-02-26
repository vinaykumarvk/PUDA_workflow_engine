import { useState } from "react";
import { Alert, Button, Field, Input, PasswordInput } from "@puda/shared";
import { useTheme } from "./theme";
import type { ThemePreference } from "./theme";

interface OfficerLoginProps {
  onLogin: (loginId: string, password: string) => Promise<void>;
}

export default function OfficerLogin({ onLogin }: OfficerLoginProps) {
  const { theme, setTheme } = useTheme("puda_officer_theme");
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
          <p className="eyebrow">PUDA Officer Workbench</p>
          <h1>Officer Login</h1>
        </div>
        <select
          className="login-theme-select"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemePreference)}
          aria-label="Theme"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </header>
      <main id="officer-login-main" className="panel officer-login-panel" role="main">
        <form onSubmit={handleSubmit} className="officer-login-form">
          {loginError ? <Alert variant="error">{loginError}</Alert> : null}
          <Field label="User ID" htmlFor="officer-login-id" required>
            <Input
              id="officer-login-id"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              placeholder="e.g. officer1"
              autoComplete="username"
            />
          </Field>
          <Field label="Password" htmlFor="officer-login-password" required>
            <PasswordInput
              id="officer-login-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </Field>
          <Button
            type="submit"
            disabled={loginLoading}
            fullWidth
          >
            {loginLoading ? "Logging in..." : "Login"}
          </Button>
          <div className="test-credentials">
            <p className="test-credentials__title">Test Credentials (password: password123)</p>
            <p>officer1 = Clerk (all services, first stage)</p>
            <p>officer2 = Sr. Assistant (NDC, second stage)</p>
            <p>officer3 = Account Officer (NDC, final approval)</p>
            <p>officer4 = Junior Engineer (Water/Sewerage)</p>
            <p>officer5 = SDO (Water/Sewerage, final approval)</p>
            <p>officer6 = Draftsman (Architect, final approval)</p>
          </div>
        </form>
      </main>
    </div>
  );
}
