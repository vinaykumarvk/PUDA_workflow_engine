import { useState } from "react";
import { Alert, Button, Card, Input, Select } from "@puda/shared";
import { Application, apiBaseUrl } from "./types";

interface SearchPanelProps {
  authHeaders: () => Record<string, string>;
  onSelectApplication: (app: Application) => void;
  isOffline: boolean;
}

export default function SearchPanel({ authHeaders, onSelectApplication, isOffline }: SearchPanelProps) {
  const skeletonItems = [0, 1, 2, 3];
  const [searchTerm, setSearchTerm] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [searchResults, setSearchResults] = useState<Application[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSearch = async () => {
    if (isOffline) {
      setError("Offline mode is active. Search is unavailable.");
      return;
    }
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchResults([]);
    setError(null);
    try {
      const params = new URLSearchParams({ searchTerm: searchTerm.trim(), limit: "50" });
      if (searchStatus) params.append("status", searchStatus);
      const res = await fetch(`${apiBaseUrl}/api/v1/applications/search?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setSearchResults(data.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleExport = async () => {
    if (isOffline) {
      setError("Offline mode is active. Export is unavailable.");
      return;
    }
    if (exportLoading) return;
    setExportLoading(true);
    setError(null);
    const params = new URLSearchParams({ searchTerm: searchTerm.trim() });
    if (searchStatus) params.append("status", searchStatus);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/applications/export?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition");
      const fileNameMatch = contentDisposition?.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = fileNameMatch?.[1] || "applications_export.csv";

      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="search-form">
        <div className="search-input-group">
          <label htmlFor="officer-search-term" className="sr-only">
            Search applications
          </label>
          <Input
            id="officer-search-term"
            type="text"
            placeholder="Search by ARN, applicant name, UPN, plot, or scheme..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && performSearch()}
            className="search-input"
            disabled={isOffline}
          />
          <label htmlFor="officer-search-status" className="sr-only">
            Filter by status
          </label>
          <Select
            id="officer-search-status"
            value={searchStatus}
            onChange={(e) => setSearchStatus(e.target.value)}
            className="search-status-select"
            disabled={isOffline}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="PENDING_AT_CLERK">Pending at Clerk</option>
            <option value="QUERY_PENDING">Query Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CLOSED">Closed</option>
          </Select>
          <Button onClick={performSearch} className="search-button" disabled={searchLoading || isOffline}>
            {searchLoading ? "Searching..." : "Search"}
          </Button>
          {searchResults.length > 0 && (
            <Button variant="success" onClick={handleExport} className="export-button" disabled={exportLoading || isOffline}>
              {exportLoading ? "Exporting..." : "Export CSV"}
            </Button>
          )}
        </div>
      </div>

      {isOffline ? (
        <Alert variant="warning">Offline mode is active. Search and export are disabled.</Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      {searchLoading ? (
        <div className="search-results">
          <h2>Search Results</h2>
          <ul className="task-list officer-skeleton-list" aria-label="Searching applications">
            {skeletonItems.map((idx) => (
              <li key={idx}>
                <Card className="task-card-wrap task-card-skeleton" aria-hidden="true">
                  <div className="skeleton skeleton-task-title" />
                  <div className="skeleton skeleton-task-line" />
                  <div className="skeleton skeleton-task-line short" />
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {searchResults.length > 0 && (
        <div className="search-results">
          <h2>Search Results ({searchResults.length})</h2>
          <ul className="task-list">
            {searchResults.map((app) => (
              <li key={app.arn}>
                <Card className="task-card-wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    className="task-card"
                    onClick={() => onSelectApplication(app)}
                  >
                    <div>
                      <h2>ARN: {app.arn}</h2>
                      <p>Service: {app.service_key}</p>
                      <p>Status: {app.state_id}</p>
                      <p>Applicant: {app.data_jsonb?.applicant?.full_name || app.data_jsonb?.applicant?.name || "N/A"}</p>
                      {app.data_jsonb?.property?.upn && <p>UPN: {app.data_jsonb.property.upn}</p>}
                      {app.data_jsonb?.property?.plot_no && <p>Plot: {app.data_jsonb.property.plot_no}</p>}
                    </div>
                    <span className="badge">{app.state_id}</span>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!searchLoading && searchTerm && searchResults.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3>No applications found</h3>
          <p>No applications matched your search criteria. Try broadening your search.</p>
        </div>
      )}
    </section>
  );
}
