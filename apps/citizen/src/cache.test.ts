import { beforeEach, describe, expect, it } from "vitest";
import { clearCitizenCachedState, readCached, writeCached } from "./cache";

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

describe("cache hygiene hardening", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
      writable: true
    });
  });

  it("evicts entries beyond TTL", () => {
    const key = "puda_citizen_cache_profile_u1";
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        schema: "citizen-profile-v1",
        data: { applicant: { full_name: "Citizen One" } },
        fetchedAt: new Date(Date.now() - 60_000).toISOString()
      })
    );

    const cached = readCached(key, {
      schema: "citizen-profile-v1",
      maxAgeMs: 1_000
    });
    expect(cached).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("evicts entries when schema mismatches", () => {
    const key = "puda_citizen_cache_services";
    writeCached(key, [{ serviceKey: "x" }], { schema: "citizen-services-v1" });

    const cached = readCached(key, {
      schema: "citizen-services-v2"
    });
    expect(cached).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("evicts entries when schema version mismatches", () => {
    const key = "puda_citizen_cache_applications_u1";
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 99,
        schema: "citizen-applications-v1",
        data: [{ arn: "ARN-1" }],
        fetchedAt: new Date().toISOString()
      })
    );

    const cached = readCached(key, {
      schema: "citizen-applications-v1"
    });
    expect(cached).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("purges malformed JSON entries", () => {
    const key = "puda_citizen_cache_profile_u1";
    localStorage.setItem(key, "{ bad-json");

    const cached = readCached(key, {
      schema: "citizen-profile-v1"
    });
    expect(cached).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("clears only citizen cache namespaces on cache reset", () => {
    localStorage.setItem("puda_citizen_cache_services", "{}");
    localStorage.setItem("puda_citizen_dashboard_cache_u1", "{}");
    localStorage.setItem("puda_citizen_resume_v1_u1", "{}");
    localStorage.setItem("puda_citizen_last_sync_u1", "{}");
    localStorage.setItem("puda_citizen_auth", "{}");
    localStorage.setItem("unrelated_key", "keep");

    clearCitizenCachedState();

    expect(localStorage.getItem("puda_citizen_cache_services")).toBeNull();
    expect(localStorage.getItem("puda_citizen_dashboard_cache_u1")).toBeNull();
    expect(localStorage.getItem("puda_citizen_resume_v1_u1")).toBeNull();
    expect(localStorage.getItem("puda_citizen_last_sync_u1")).toBeNull();
    expect(localStorage.getItem("puda_citizen_auth")).toBe("{}");
    expect(localStorage.getItem("unrelated_key")).toBe("keep");
  });
});
