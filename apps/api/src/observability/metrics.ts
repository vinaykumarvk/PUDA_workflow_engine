import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "puda_api_" });

const httpRequestDurationSeconds = new Histogram({
  name: "puda_api_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

const httpRequestsTotal = new Counter({
  name: "puda_api_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

const httpErrorsTotal = new Counter({
  name: "puda_api_http_errors_total",
  help: "Total HTTP requests resulting in 5xx responses",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

const dbQueryDurationSeconds = new Histogram({
  name: "puda_api_db_query_duration_seconds",
  help: "DB query latency in seconds",
  labelNames: ["operation", "success"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [registry],
});

const dbQueriesTotal = new Counter({
  name: "puda_api_db_queries_total",
  help: "Total DB queries",
  labelNames: ["operation", "success"] as const,
  registers: [registry],
});

const dbPoolTotalClients = new Gauge({
  name: "puda_api_db_pool_total_clients",
  help: "Total PostgreSQL clients in pool",
  registers: [registry],
});

const dbPoolIdleClients = new Gauge({
  name: "puda_api_db_pool_idle_clients",
  help: "Idle PostgreSQL clients in pool",
  registers: [registry],
});

const dbPoolWaitingClients = new Gauge({
  name: "puda_api_db_pool_waiting_clients",
  help: "Waiting PostgreSQL client requests in pool queue",
  registers: [registry],
});

const workflowBacklogOpenTasks = new Gauge({
  name: "puda_api_workflow_backlog_open_tasks",
  help: "Open workflow tasks (queue backlog proxy)",
  registers: [registry],
});

const workflowBacklogOverdueTasks = new Gauge({
  name: "puda_api_workflow_backlog_overdue_tasks",
  help: "Open workflow tasks past SLA due date",
  registers: [registry],
});

function normalizeOperation(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) return "UNKNOWN";
  const match = trimmed.match(/^([A-Za-z]+)/);
  return (match?.[1] || "UNKNOWN").toUpperCase();
}

export function recordHttpRequestMetric(input: {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}): void {
  const labels = {
    method: input.method.toUpperCase(),
    route: input.route,
    status_code: String(input.statusCode),
  };
  httpRequestsTotal.inc(labels, 1);
  httpRequestDurationSeconds.observe(labels, input.durationSeconds);
  if (input.statusCode >= 500) {
    httpErrorsTotal.inc(labels, 1);
  }
}

export function recordDbQueryMetric(sql: string, durationSeconds: number, success: boolean): void {
  const labels = {
    operation: normalizeOperation(sql),
    success: success ? "true" : "false",
  };
  dbQueriesTotal.inc(labels, 1);
  dbQueryDurationSeconds.observe(labels, durationSeconds);
}

export function updateDbPoolMetric(input: {
  totalClients: number;
  idleClients: number;
  waitingClients: number;
}): void {
  dbPoolTotalClients.set(input.totalClients);
  dbPoolIdleClients.set(input.idleClients);
  dbPoolWaitingClients.set(input.waitingClients);
}

export function updateWorkflowBacklogMetric(input: {
  openTasks: number;
  overdueTasks: number;
}): void {
  workflowBacklogOpenTasks.set(input.openTasks);
  workflowBacklogOverdueTasks.set(input.overdueTasks);
}

export function getMetricsContentType(): string {
  return registry.contentType;
}

export async function getMetricsSnapshot(): Promise<string> {
  return registry.metrics();
}
