import React from "react";
import ReactDOM from "react-dom/client";
import { initErrorReporting } from "@puda/shared/error-reporting";
import { ErrorBoundary } from "./ErrorBoundary";
import { ToastProvider } from "@puda/shared";
import App from "./App";
import "./design-system.css";

initErrorReporting({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  app: "officer-portal",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
