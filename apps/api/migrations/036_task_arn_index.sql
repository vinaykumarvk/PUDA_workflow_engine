-- PERF-004: Index for task timeline query on application detail
-- Covers: SELECT ... FROM task WHERE arn = $1 ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_arn_created_desc
ON task (arn, created_at DESC);
