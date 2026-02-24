import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useTranslation } from "react-i18next";
import { Alert, Button, Field, Input, PasswordInput } from "@puda/shared";
import "./login.css";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./theme";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

type LoginMethod = "password" | "aadhar";

export default function Login() {
  const { login } = useAuth();
  const { t, i18n } = useTranslation();
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
        body: JSON.stringify({ login: loginId, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Invalid credentials");
      }

      if (data.user.user_type !== "CITIZEN") {
        throw new Error("Access denied. Citizen login only.");
      }

      login(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
        body: JSON.stringify({ aadhar }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP");
      }

      setOtpSent(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
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
        body: JSON.stringify({ aadhar, otp }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Invalid OTP");
      }

      if (data.user.user_type !== "CITIZEN") {
        throw new Error("Access denied. Citizen login only.");
      }

      login(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP");
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
        body: JSON.stringify({ login: forgotLoginId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send reset link");
      }

      setForgotPasswordSent(true);
      // In dev mode, extract token from console log or show message
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to reset password");
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
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="login-page" role="main" aria-label="Reset Password">
        <a href="#forgot-form" className="skip-link">Skip to reset form</a>
        <div className="login-container">
          <div className="login-header">
            <h1>PUDA Citizen Portal</h1>
            <p className="subtitle">Reset Password</p>
            <div className="login-header-controls">
              <ThemeToggle
                theme={theme}
                resolvedTheme={resolvedTheme}
                onThemeChange={setTheme}
                idSuffix="forgot-password"
              />
              <button
                type="button"
                className="lang-toggle"
                onClick={() => {
                  const next = i18n.language === "en" ? "pa" : "en";
                  i18n.changeLanguage(next);
                  localStorage.setItem("puda_lang", next);
                }}
                aria-label="Switch language"
              >
                {i18n.language === "en" ? "ਪੰਜਾਬੀ" : "English"}
              </button>
            </div>
          </div>

          {!forgotPasswordSent ? (
            <form id="forgot-form" onSubmit={handleForgotPassword} className="login-form">
              {error ? <Alert variant="error">{error}</Alert> : null}

              <Field label="User ID / Login" htmlFor="forgot-login" required>
                <Input
                  id="forgot-login"
                  type="text"
                  value={forgotLoginId}
                  onChange={(e) => setForgotLoginId(e.target.value)}
                  required
                  placeholder="Enter your login ID"
                />
              </Field>

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
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
                Back to Login
              </Button>
            </form>
          ) : (
            <form id="forgot-form" onSubmit={handleResetPassword} className="login-form">
              {resetSuccess && (
                <Alert variant="success">Password reset successfully! Redirecting to login...</Alert>
              )}
              <Alert variant="info">
                Password reset link has been sent. Check the console for the reset token (dev mode).
              </Alert>
              
              {error ? <Alert variant="error">{error}</Alert> : null}

              <Field label="Reset Token" htmlFor="reset-token" required>
                <Input
                  id="reset-token"
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                  placeholder="Paste reset token from console"
                />
              </Field>

              <Field label="New Password" htmlFor="new-password" required>
                <PasswordInput
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Enter new password"
                />
              </Field>

              <Field label="Confirm Password" htmlFor="confirm-password" required>
                <PasswordInput
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                />
              </Field>

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? "Resetting..." : "Reset Password"}
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
                Back to Login
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-page" role="main" aria-label="Login">
      <a href="#login-form" className="skip-link">Skip to login form</a>
      <div className="login-container">
        <div className="login-header">
          <h1>{t("app_title")}</h1>
          <p className="subtitle">{t("login")}</p>
          <div className="login-header-controls">
            <ThemeToggle
              theme={theme}
              resolvedTheme={resolvedTheme}
              onThemeChange={setTheme}
              idSuffix="login"
            />
            <button
              type="button"
              className="lang-toggle"
              onClick={() => {
                const next = i18n.language === "en" ? "pa" : "en";
                i18n.changeLanguage(next);
                localStorage.setItem("puda_lang", next);
              }}
              aria-label="Switch language"
            >
              {i18n.language === "en" ? "ਪੰਜਾਬੀ" : "English"}
            </button>
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
            User ID & Password
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
            Aadhar OTP
          </button>
        </div>

        {method === "password" ? (
          <div id={passwordPanelId} role="tabpanel" aria-labelledby={passwordTabId}>
            <form id="login-form" onSubmit={handlePasswordLogin} className="login-form">
            {error ? <Alert variant="error">{error}</Alert> : null}

            <Field label="User ID / Login" htmlFor="login-id" required>
              <Input
                id="login-id"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                placeholder="Enter your login ID"
                autoComplete="username"
              />
            </Field>

            <Field label="Password" htmlFor="password" required>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </Field>

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => setShowForgotPassword(true)}
            >
              Forgot Password?
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
                  label="Aadhar Number"
                  htmlFor="aadhar"
                  required
                  hint="Enter 12-digit Aadhar number"
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
                    placeholder="Enter 12-digit Aadhar number"
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
                  {sendingOtp ? "Sending OTP..." : "Send OTP"}
                </Button>
              </>
            ) : (
              <>
                <Alert variant="info" aria-live="polite">
                  OTP sent! Check console for OTP (dev mode). Any OTP will be accepted.
                </Alert>

                <Field label="Enter OTP" htmlFor="otp" required>
                  <Input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 6) setOtp(val);
                    }}
                    required
                    placeholder="Enter 6-digit OTP"
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
                  {loading ? "Verifying..." : "Verify OTP"}
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
                  Resend OTP
                </Button>
              </>
            )}
            </form>
          </div>
        )}

        <div className="login-footer">
          <p>Test Credentials: citizen1 / password123</p>
        </div>
      </div>
    </div>
  );
}
