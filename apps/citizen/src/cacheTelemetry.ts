export type CacheTelemetryCounter =
  | "cache_fallback_offline"
  | "cache_fallback_error"
  | "stale_data_served";

export type CacheTelemetryPayload = {
  schemaVersion: number;
  counters: Record<CacheTelemetryCounter, number>;
  bySource: Record<string, number>;
  updatedAt: string;
};

const TELEMETRY_KEY = "puda_citizen_cache_telemetry_v1";
const TELEMETRY_SCHEMA_VERSION = 1;
const LAST_SENT_KEY = "puda_citizen_cache_telemetry_last_sent_v1";
const MAX_SOURCE_ENTRIES = 200;
const SOURCE_KEY_PATTERN = /^[a-z0-9_:\-]{1,80}$/;
const COUNTERS: CacheTelemetryCounter[] = [
  "cache_fallback_offline",
  "cache_fallback_error",
  "stale_data_served"
];

export type CacheTelemetryFlushOptions = {
  apiBaseUrl: string;
  token?: string | null;
  userId?: string;
  keepalive?: boolean;
  fetchImpl?: typeof fetch;
};

export type CacheTelemetryRetryOptions = CacheTelemetryFlushOptions & {
  maxAttempts?: number;
  baseDelayMs?: number;
};

function createEmptyTelemetry(): CacheTelemetryPayload {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    counters: {
      cache_fallback_offline: 0,
      cache_fallback_error: 0,
      stale_data_served: 0
    },
    bySource: {},
    updatedAt: new Date(0).toISOString()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toTelemetryPayload(value: unknown): CacheTelemetryPayload | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== TELEMETRY_SCHEMA_VERSION) return null;
  if (!isRecord(value.counters) || !isRecord(value.bySource)) return null;

  const counters = value.counters;
  const base = createEmptyTelemetry();
  if (
    typeof counters.cache_fallback_offline !== "number" ||
    typeof counters.cache_fallback_error !== "number" ||
    typeof counters.stale_data_served !== "number"
  ) {
    return null;
  }

  const bySource: Record<string, number> = {};
  Object.entries(value.bySource).forEach(([key, count]) => {
    if (typeof count === "number") bySource[key] = count;
  });

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    counters: {
      cache_fallback_offline: counters.cache_fallback_offline,
      cache_fallback_error: counters.cache_fallback_error,
      stale_data_served: counters.stale_data_served
    },
    bySource,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : base.updatedAt
  };
}

function readTelemetry(): CacheTelemetryPayload {
  const empty = createEmptyTelemetry();
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const telemetry = toTelemetryPayload(parsed);
    if (!telemetry) {
      localStorage.removeItem(TELEMETRY_KEY);
      return empty;
    }
    return telemetry;
  } catch {
    try {
      localStorage.removeItem(TELEMETRY_KEY);
    } catch {
      // Ignore storage cleanup errors.
    }
    return empty;
  }
}

function writeTelemetry(payload: CacheTelemetryPayload): void {
  try {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota or serialization failures.
  }
}

export function incrementCacheTelemetry(
  counter: CacheTelemetryCounter,
  source: string
): CacheTelemetryPayload {
  const current = readTelemetry();
  const sourceKey = `${counter}:${source}`;
  const updatedAt = new Date().toISOString();
  const next: CacheTelemetryPayload = {
    ...current,
    counters: {
      ...current.counters,
      [counter]: current.counters[counter] + 1
    },
    bySource: {
      ...current.bySource,
      [sourceKey]: (current.bySource[sourceKey] || 0) + 1
    },
    updatedAt
  };
  writeTelemetry(next);

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(
        new CustomEvent("puda:cache-telemetry", {
          detail: {
            counter,
            source,
            total: next.counters[counter],
            sourceTotal: next.bySource[sourceKey],
            updatedAt
          }
        })
      );
    } catch {
      // Ignore CustomEvent issues in constrained environments.
    }
  }

  return next;
}

export function getCacheTelemetrySnapshot(): CacheTelemetryPayload {
  return readTelemetry();
}

function hasCounterActivity(counters: Record<CacheTelemetryCounter, number>): boolean {
  return COUNTERS.some((counter) => Number(counters[counter] || 0) > 0);
}

function sanitizeSourceDelta(sourceDelta: Record<string, number>): Record<string, number> {
  const entries = Object.entries(sourceDelta)
    .filter(([key, value]) => SOURCE_KEY_PATTERN.test(key) && Number.isFinite(value) && value > 0)
    .slice(0, MAX_SOURCE_ENTRIES);
  return Object.fromEntries(entries);
}

function readLastSentSnapshot(): CacheTelemetryPayload {
  const empty = createEmptyTelemetry();
  try {
    const raw = localStorage.getItem(LAST_SENT_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const telemetry = toTelemetryPayload(parsed);
    if (!telemetry) {
      localStorage.removeItem(LAST_SENT_KEY);
      return empty;
    }
    return telemetry;
  } catch {
    try {
      localStorage.removeItem(LAST_SENT_KEY);
    } catch {
      // Ignore storage cleanup errors.
    }
    return empty;
  }
}

function writeLastSentSnapshot(snapshot: CacheTelemetryPayload): void {
  try {
    localStorage.setItem(LAST_SENT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota failures.
  }
}

function subtractCounters(
  current: Record<CacheTelemetryCounter, number>,
  previous: Record<CacheTelemetryCounter, number>
): Record<CacheTelemetryCounter, number> {
  return {
    cache_fallback_offline: Math.max(0, Number(current.cache_fallback_offline || 0) - Number(previous.cache_fallback_offline || 0)),
    cache_fallback_error: Math.max(0, Number(current.cache_fallback_error || 0) - Number(previous.cache_fallback_error || 0)),
    stale_data_served: Math.max(0, Number(current.stale_data_served || 0) - Number(previous.stale_data_served || 0))
  };
}

function subtractBySource(
  current: Record<string, number>,
  previous: Record<string, number>
): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const [key, value] of Object.entries(current)) {
    const next = Number(value || 0) - Number(previous[key] || 0);
    if (Number.isFinite(next) && next > 0) {
      delta[key] = next;
    }
  }
  return sanitizeSourceDelta(delta);
}

function hasDelta(
  counterDelta: Record<CacheTelemetryCounter, number>,
  sourceDelta: Record<string, number>
): boolean {
  return hasCounterActivity(counterDelta) || Object.keys(sourceDelta).length > 0;
}

export async function flushCacheTelemetry(
  options: CacheTelemetryFlushOptions
): Promise<{ flushed: boolean; reason?: string; status?: number }> {
  if (!options.apiBaseUrl) {
    return { flushed: false, reason: "MISSING_API_BASE_URL" };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { flushed: false, reason: "OFFLINE" };
  }

  const current = readTelemetry();
  if (!hasCounterActivity(current.counters) && Object.keys(current.bySource).length === 0) {
    return { flushed: false, reason: "NO_ACTIVITY" };
  }

  const previous = readLastSentSnapshot();
  const counterDelta = subtractCounters(current.counters, previous.counters);
  const sourceDelta = subtractBySource(current.bySource, previous.bySource);
  if (!hasDelta(counterDelta, sourceDelta)) {
    return { flushed: false, reason: "NO_DELTA" };
  }

  const fetchFn = options.fetchImpl || fetch;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetchFn(`${options.apiBaseUrl}/api/v1/client-telemetry/cache`, {
    method: "POST",
    headers,
    keepalive: Boolean(options.keepalive),
    body: JSON.stringify({
      app: "citizen",
      clientUpdatedAt: current.updatedAt,
      counterDelta,
      sourceDelta,
      userId: options.userId
    })
  });

  if (!response.ok) {
    return { flushed: false, reason: "HTTP_ERROR", status: response.status };
  }
  writeLastSentSnapshot(current);
  return { flushed: true, status: response.status };
}

function shouldRetry(result: { flushed: boolean; reason?: string; status?: number }): boolean {
  return result.reason === "HTTP_ERROR" && Number(result.status || 0) >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function flushCacheTelemetryWithRetry(
  options: CacheTelemetryRetryOptions
): Promise<{ flushed: boolean; reason?: string; status?: number; attempts: number }> {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 3));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs || 300));

  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const result = await flushCacheTelemetry(options);
      if (result.flushed) return { ...result, attempts };
      if (!shouldRetry(result) || attempts >= maxAttempts) {
        return { ...result, attempts };
      }
    } catch {
      if (attempts >= maxAttempts) {
        return { flushed: false, reason: "NETWORK_ERROR", attempts };
      }
    }

    const delayMs = baseDelayMs * 2 ** (attempts - 1);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { flushed: false, reason: "NO_DELTA", attempts };
}
