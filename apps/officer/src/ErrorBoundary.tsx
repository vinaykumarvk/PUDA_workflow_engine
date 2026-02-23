import { Component, ErrorInfo, ReactNode } from "react";
import { getErrorReporter } from "@puda/shared/error-reporting";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    getErrorReporter().captureException(error, {
      componentStack: errorInfo.componentStack || undefined,
    });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: "2rem", fontFamily: "var(--font-sans, sans-serif)", maxWidth: "600px", margin: "2rem auto" }}>
          <h2 style={{ color: "var(--color-danger, #c00)", marginBottom: "1rem" }}>Something went wrong</h2>
          <pre style={{ background: "var(--color-bg-elevated, #f5f5f5)", padding: "1rem", overflow: "auto", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
            {this.state.error.message}
          </pre>
          <p style={{ fontSize: "0.9rem", marginTop: "1rem", color: "var(--color-text-muted, #666)" }}>
            This error has been reported. Try refreshing the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid #ccc", cursor: "pointer", fontWeight: 600 }}
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
