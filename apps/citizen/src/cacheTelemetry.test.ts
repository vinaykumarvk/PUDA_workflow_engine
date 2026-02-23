import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushCacheTelemetry,
  flushCacheTelemetryWithRetry,
  incrementCacheTelemetry,
} from "./cacheTelemetry";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function setNavigatorOnline(onLine: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine },
    writable: true,
    configurable: true
  });
}

describe("cache telemetry flush behavior", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: new MemoryStorage(),
      writable: true,
      configurable: true
    });
    setNavigatorOnline(true);
  });

  it("skips flush when there is no telemetry activity", async () => {
    const fetchMock = vi.fn();
    const result = await flushCacheTelemetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any
    });
    expect(result).toEqual({ flushed: false, reason: "NO_ACTIVITY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips flush while offline", async () => {
    incrementCacheTelemetry("cache_fallback_offline", "dashboard");
    setNavigatorOnline(false);
    const fetchMock = vi.fn();
    const result = await flushCacheTelemetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any
    });
    expect(result).toEqual({ flushed: false, reason: "OFFLINE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advances checkpoint after successful flush and suppresses duplicate sends", async () => {
    incrementCacheTelemetry("cache_fallback_offline", "dashboard");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });

    const first = await flushCacheTelemetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any
    });
    expect(first.flushed).toBe(true);
    expect(first.status).toBe(202);

    const second = await flushCacheTelemetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any
    });
    expect(second).toEqual({ flushed: false, reason: "NO_DELTA" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not advance checkpoint on failed flush", async () => {
    incrementCacheTelemetry("cache_fallback_error", "profile");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 202 });

    const first = await flushCacheTelemetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any
    });
    expect(first).toEqual({ flushed: false, reason: "HTTP_ERROR", status: 500 });

    const second = await flushCacheTelemetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any
    });
    expect(second.flushed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries transient server failures and eventually flushes", async () => {
    incrementCacheTelemetry("stale_data_served", "applications");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 202 });

    const result = await flushCacheTelemetryWithRetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any,
      maxAttempts: 2,
      baseDelayMs: 1
    });

    expect(result.flushed).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns network error after exhausting retry attempts", async () => {
    incrementCacheTelemetry("stale_data_served", "dashboard");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await flushCacheTelemetryWithRetry({
      apiBaseUrl: "http://example.test",
      fetchImpl: fetchMock as any,
      maxAttempts: 2,
      baseDelayMs: 1
    });

    expect(result).toEqual({ flushed: false, reason: "NETWORK_ERROR", attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
