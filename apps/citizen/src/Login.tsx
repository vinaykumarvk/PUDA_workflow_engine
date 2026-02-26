import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useTranslation } from "react-i18next";
import { Alert, Button, Field, Input, PasswordInput } from "@puda/shared";
import "./login.css";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./theme";
import { Bilingual } from "./Bilingual";
import { SECONDARY_LANGUAGES } from "./i18n";
import { useSecondaryLanguage } from "./SecondaryLanguageContext";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type LoginMethod = "password" | "aadhar";

export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const secondaryLang = useSecondaryLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme("puda_citizen_theme");
  const [method, setMethod] = useState<LoginMethod>("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password login state
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  // Aadhar login state
  const [aadhar, setAadhar] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotLoginId, setForgotLoginId] = useState("");
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const passwordTabId = "citizen-login-tab-password";
  const aadharTabId = "citizen-login-tab-aadhar";
  const passwordPanelId = "citizen-login-panel-password";
  const aadharPanelId = "citizen-login-panel-aadhar";

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, target: LoginMethod) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setMethod(target);
      setError(null);
      setOtpSent(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: loginId, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || t("login.invalid_credentials"));
      }

      if (data.user.user_type !== "CITIZEN") {
        throw new Error(t("login.access_denied"));
      }

      login(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.login_failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSendingOtp(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/aadhar/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aadhar }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || t("login.failed_send_otp"));
      }

      setOtpSent(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed_send_otp"));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/aadhar/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aadhar, otp }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || t("login.invalid_otp"));
      }

      if (data.user.user_type !== "CITIZEN") {
        throw new Error(t("login.access_denied"));
      }

      login(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.invalid_otp"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: forgotLoginId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || t("login.failed_reset"));
      }

      setForgotPasswordSent(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed_reset"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("login.passwords_mismatch"));
      return;
    }

    if (newPassword.length < 6) {
      setError(t("login.password_too_short"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: resetToken, newPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || t("login.failed_reset"));
      }

      setResetSuccess(true);
      setTimeout(() => {
        setShowForgotPassword(false);
        setMethod("password");
        setResetToken("");
        setNewPassword("");
        setConfirmPassword("");
        setResetSuccess(false);
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed_reset"));
    } finally {
      setLoading(false);
    }
  };

  const secondaryLangLabel = SECONDARY_LANGUAGES.find(
    (l) => l.code !== secondaryLang
  )?.label ?? SECONDARY_LANGUAGES[0].label;

  if (showForgotPassword) {
    return (
      <div className="login-page" role="main" aria-label={t("login.reset_password")}>
        <a href="#forgot-form" className="skip-link">{t("common.skip_to_main")}</a>
        <div className="login-container">
          <div className="login-header">
            <h1><Bilingual tKey="nav.portal_name" /></h1>
            <p className="subtitle"><Bilingual tKey="login.reset_password" /></p>
            <div className="login-header-controls">
              <ThemeToggle
                theme={theme}
                resolvedTheme={resolvedTheme}
                onThemeChange={setTheme}
                idSuffix="forgot-password"
              />
            </div>
          </div>

          {!forgotPasswordSent ? (
            <form id="forgot-form" onSubmit={handleForgotPassword} className="login-form">
              {error ? <Alert variant="error">{error}</Alert> : null}

              <Field label={<Bilingual tKey="login.user_id" />} htmlFor="forgot-login" required>
                <Input
                  id="forgot-login"
                  type="text"
                  value={forgotLoginId}
                  onChange={(e) => setForgotLoginId(e.target.value)}
                  required
                  placeholder={t("login.enter_login_id")}
                />
              </Field>

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? t("login.sending") : t("login.send_reset_link")}
              </Button>

              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => {
                  setShowForgotPassword(false);
                  setError(null);
                }}
              >
                {t("login.back_to_login")}
              </Button>
            </form>
          ) : (
            <form id="forgot-form" onSubmit={handleResetPassword} className="login-form">
              {resetSuccess && (
                <Alert variant="success">{t("login.reset_success")}</Alert>
              )}
              <Alert variant="info">
                {t("login.reset_link_sent")}
              </Alert>

              {error ? <Alert variant="error">{error}</Alert> : null}

              <Field label={<Bilingual tKey="login.reset_token" />} htmlFor="reset-token" required>
                <Input
                  id="reset-token"
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                  placeholder={t("login.reset_token_hint")}
                />
              </Field>

              <Field label={<Bilingual tKey="login.new_password" />} htmlFor="new-password" required>
                <PasswordInput
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder={t("login.enter_new_password")}
                />
              </Field>

              <Field label={<Bilingual tKey="login.confirm_password" />} htmlFor="confirm-password" required>
                <PasswordInput
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder={t("login.confirm_new_password")}
                />
              </Field>

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? t("login.resetting") : t("login.reset_password")}
              </Button>

              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordSent(false);
                  setError(null);
                }}
              >
                {t("login.back_to_login")}
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-page" role="main" aria-label={t("login.title")}>
      <a href="#login-form" className="skip-link">{t("common.skip_to_main")}</a>
      <div className="login-container">
        <div className="login-header">
          <h1><Bilingual tKey="nav.portal_name" /></h1>
          <p className="subtitle"><Bilingual tKey="login.title" /></p>
          <div className="login-header-controls">
            <ThemeToggle
              theme={theme}
              resolvedTheme={resolvedTheme}
              onThemeChange={setTheme}
              idSuffix="login"
            />
          </div>
        </div>

        <div className="login-tabs" role="tablist" aria-label="Login methods">
          <button
            id={passwordTabId}
            role="tab"
            aria-selected={method === "password"}
            aria-controls={passwordPanelId}
            tabIndex={method === "password" ? 0 : -1}
            className={`tab ${method === "password" ? "active" : ""}`}
            onClick={() => {
              setMethod("password");
              setError(null);
              setOtpSent(false);
            }}
            onKeyDown={(event) => handleTabKeyDown(event, "aadhar")}
          >
            {t("login.tab_password")}
          </button>
          <button
            id={aadharTabId}
            role="tab"
            aria-selected={method === "aadhar"}
            aria-controls={aadharPanelId}
            tabIndex={method === "aadhar" ? 0 : -1}
            className={`tab ${method === "aadhar" ? "active" : ""}`}
            onClick={() => {
              setMethod("aadhar");
              setError(null);
              setOtpSent(false);
            }}
            onKeyDown={(event) => handleTabKeyDown(event, "password")}
          >
            {t("login.tab_aadhar")}
          </button>
        </div>

        {method === "password" ? (
          <div id={passwordPanelId} role="tabpanel" aria-labelledby={passwordTabId}>
            <form id="login-form" onSubmit={handlePasswordLogin} className="login-form">
            {error ? <Alert variant="error">{error}</Alert> : null}

            <Field label={<Bilingual tKey="login.user_id" />} htmlFor="login-id" required>
              <Input
                id="login-id"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                placeholder={t("login.enter_login_id")}
                autoComplete="username"
              />
            </Field>

            <Field label={<Bilingual tKey="login.password" />} htmlFor="password" required>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t("login.enter_password")}
                autoComplete="current-password"
              />
            </Field>

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? t("login.logging_in") : t("login.title")}
            </Button>

            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => setShowForgotPassword(true)}
            >
              {t("login.forgot_password")}
            </Button>
            </form>
          </div>
        ) : (
          <div id={aadharPanelId} role="tabpanel" aria-labelledby={aadharTabId}>
            <form
              id="login-form"
              onSubmit={otpSent ? handleVerifyOTP : handleSendOTP}
              className="login-form"
            >
            {error ? <Alert variant="error">{error}</Alert> : null}

            {!otpSent ? (
              <>
                <Field
                  label={<Bilingual tKey="login.aadhar_number" />}
                  htmlFor="aadhar"
                  required
                  hint={t("login.aadhar_hint")}
                >
                  <Input
                    id="aadhar"
                    type="text"
                    value={aadhar}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 12) setAadhar(val);
                    }}
                    required
                    placeholder={t("login.aadhar_hint")}
                    maxLength={12}
                    pattern="\d{12}"
                    inputMode="numeric"
                  />
                </Field>

                <Button
                  type="submit"
                  fullWidth
                  disabled={sendingOtp || aadhar.length !== 12}
                >
                  {sendingOtp ? t("login.sending_otp") : t("login.send_otp")}
                </Button>
              </>
            ) : (
              <>
                <Alert variant="info" aria-live="polite">
                  {t("login.otp_sent_dev")}
                </Alert>

                <Field label={<Bilingual tKey="login.enter_otp" />} htmlFor="otp" required>
                  <Input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 6) setOtp(val);
                    }}
                    required
                    placeholder={t("login.enter_otp_placeholder")}
                    maxLength={6}
                    pattern="\d{6}"
                    inputMode="numeric"
                    autoFocus
                  />
                </Field>

                <Button
                  type="submit"
                  fullWidth
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? t("login.verifying") : t("login.verify_otp")}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setError(null);
                  }}
                >
                  {t("login.resend_otp")}
                </Button>
              </>
            )}
            </form>
          </div>
        )}

        {import.meta.env.DEV && (
          <div className="login-footer">
            <p>{t("login.test_credentials")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
