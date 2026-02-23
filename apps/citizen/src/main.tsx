import React from "react";
import ReactDOM from "react-dom/client";
import { initErrorReporting } from "@puda/shared/error-reporting";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "@puda/shared";
import App from "./App";
import "./design-system.css";
import "./i18n";

initErrorReporting({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  app: "citizen-portal",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
