-- PERF-001: Trigram index for wildcard search/export on application table
-- Enables index-assisted ILIKE/%pattern% queries across searchable text fields.
-- Must be run outside a transaction (CONCURRENTLY) to avoid blocking writes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_search_text_trgm
ON application
USING gin (
  (
    COALESCE(public_arn, '') || ' ' ||
    arn || ' ' ||
    COALESCE(data_jsonb->'applicant'->>'full_name', '') || ' ' ||
    COALESCE(data_jsonb->'applicant'->>'name', '') || ' ' ||
    COALESCE(data_jsonb->'property'->>'upn', '') || ' ' ||
    COALESCE(data_jsonb->'property'->>'plot_no', '') || ' ' ||
    COALESCE(data_jsonb->'property'->>'scheme_name', '')
  ) gin_trgm_ops
);
