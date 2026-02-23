export type CacheEnvelope<T> = {
  schemaVersion: number;
  schema: string;
  data: T;
  fetchedAt: string;
};

export type CacheReadOptions<T> = {
  schema: string;
  maxAgeMs?: number;
  validate?: (data: unknown) => data is T;
};

export type CacheWriteOptions = {
  schema: string;
};

const CACHE_SCHEMA_VERSION = 1;

export const CITIZEN_CACHE_PREFIXES = [
  "puda_citizen_cache_",
  "puda_citizen_dashboard_cache_",
  "puda_citizen_resume_",
  "puda_citizen_last_sync_"
] as const;

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors during cleanup.
  }
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function readCached<T>(key: string, options: CacheReadOptions<T>): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (!parsed || typeof parsed !== "object") {
      safeRemove(key);
      return null;
    }
    if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) {
      safeRemove(key);
      return null;
    }
    if (parsed.schema !== options.schema) {
      safeRemove(key);
      return null;
    }
    if (!isValidTimestamp(parsed.fetchedAt)) {
      safeRemove(key);
      return null;
    }
    if (!("data" in parsed)) {
      safeRemove(key);
      return null;
    }

    if (typeof options.maxAgeMs === "number" && options.maxAgeMs > 0) {
      const age = Date.now() - Date.parse(parsed.fetchedAt);
      if (!Number.isFinite(age) || age > options.maxAgeMs) {
        safeRemove(key);
        return null;
      }
    }

    if (options.validate && !options.validate(parsed.data)) {
      safeRemove(key);
      return null;
    }

    return parsed as CacheEnvelope<T>;
  } catch {
    safeRemove(key);
    return null;
  }
}

export function writeCached<T>(key: string, data: T, options: CacheWriteOptions): CacheEnvelope<T> {
  const payload: CacheEnvelope<T> = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    schema: options.schema,
    data,
    fetchedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore quota and serialization failures; app should continue without cache.
  }
  return payload;
}

export function clearStorageByPrefixes(prefixes: readonly string[]) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    keys.forEach((key) => {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        safeRemove(key);
      }
    });
  } catch {
    // Ignore storage errors while clearing cache.
  }
}

export function clearCitizenCachedState() {
  clearStorageByPrefixes(CITIZEN_CACHE_PREFIXES);
}
