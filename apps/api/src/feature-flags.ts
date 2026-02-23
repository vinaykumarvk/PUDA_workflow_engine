import { createHash } from "node:crypto";
import { query } from "./db";
import { logWarn } from "./logger";

interface DistributedCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  flushPattern(pattern: string): Promise<void>;
}

let distributedCache: DistributedCache | null = null;

export function setDistributedCache(cache: DistributedCache): void {
  distributedCache = cache;
}

export function clearDistributedCache(): void {
  distributedCache = null;
}

interface FeatureFlagRow {
  flag_key: string;
  enabled: boolean;
  rollout_percentage: number;
  description: string | null;
  rules_jsonb: unknown;
  updated_at: Date;
  updated_by_user_id: string | null;
}

type AuthUserType = "CITIZEN" | "OFFICER" | "ADMIN";
const VALID_USER_TYPES: AuthUserType[] = ["CITIZEN", "OFFICER", "ADMIN"];

export interface FeatureFlagView {
  flagKey: string;
  enabled: boolean;
  rolloutPercentage: number;
  description: string | null;
  rules: Record<string, unknown>;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface FeatureFlagContext {
  flagKey: string;
  userId?: string | null;
  authorityId?: string | null;
  userType?: AuthUserType | null;
  systemRoles?: string[] | null;
  nowMs?: number;
}

type FeatureFlagCacheEntry = {
  expiresAtMs: number;
  value: FeatureFlagView | null;
};

const featureFlagCache = new Map<string, FeatureFlagCacheEntry>();

type FeatureFlagRules = {
  authorityIds: string[];
  userIds: string[];
  userTypes: AuthUserType[];
  systemRoles: string[];
  activeFrom: string | null;
  activeTo: string | null;
};

function cacheTtlMs(): number {
  const parsed = Number.parseInt(process.env.FEATURE_FLAG_CACHE_TTL_MS || "15000", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15000;
  return parsed;
}

function toFeatureFlagView(row: FeatureFlagRow): FeatureFlagView {
  return {
    flagKey: row.flag_key,
    enabled: row.enabled,
    rolloutPercentage: Number(row.rollout_percentage),
    description: row.description,
    rules:
      row.rules_jsonb && typeof row.rules_jsonb === "object"
        ? (row.rules_jsonb as Record<string, unknown>)
        : {},
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedByUserId: row.updated_by_user_id,
  };
}

function stableBucket(input: string): number {
  const hash = createHash("sha256").update(input).digest("hex");
  const prefix = hash.slice(0, 8);
  const value = Number.parseInt(prefix, 16);
  return value % 100;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function normalizeUserTypes(value: unknown): AuthUserType[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is AuthUserType =>
          typeof entry === "string" && VALID_USER_TYPES.includes(entry as AuthUserType)
      )
    )
  );
}

function toFeatureFlagRules(raw: Record<string, unknown>): FeatureFlagRules {
  return {
    authorityIds: normalizeStringList(raw.authorityIds),
    userIds: normalizeStringList(raw.userIds),
    userTypes: normalizeUserTypes(raw.userTypes),
    systemRoles: normalizeStringList(raw.systemRoles),
    activeFrom:
      typeof raw.activeFrom === "string" && raw.activeFrom.trim().length > 0
        ? raw.activeFrom
        : null,
    activeTo:
      typeof raw.activeTo === "string" && raw.activeTo.trim().length > 0
        ? raw.activeTo
        : null,
  };
}

function evaluateListRule(allowedValues: string[], actualValue?: string | null): boolean {
  if (allowedValues.length === 0) return true;
  if (!actualValue) return false;
  return allowedValues.includes(actualValue);
}

function evaluateSystemRolesRule(requiredSystemRoles: string[], systemRoles?: string[] | null): boolean {
  if (requiredSystemRoles.length === 0) return true;
  if (!Array.isArray(systemRoles) || systemRoles.length === 0) return false;
  const providedRoles = new Set(
    systemRoles
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  return requiredSystemRoles.some((role) => providedRoles.has(role));
}

function parseRuleDateMs(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

function evaluateTimeWindowRule(
  rules: FeatureFlagRules,
  nowMs: number,
  flagKey: string
): boolean {
  const activeFromMs = parseRuleDateMs(rules.activeFrom);
  const activeToMs = parseRuleDateMs(rules.activeTo);
  if (Number.isNaN(activeFromMs) || Number.isNaN(activeToMs)) {
    logWarn("Feature flag has invalid active window; defaulting disabled", {
      flagKey,
      activeFrom: rules.activeFrom,
      activeTo: rules.activeTo,
    });
    return false;
  }
  if (
    activeFromMs !== null &&
    activeToMs !== null &&
    activeFromMs > activeToMs
  ) {
    logWarn("Feature flag active window is inverted; defaulting disabled", {
      flagKey,
      activeFrom: rules.activeFrom,
      activeTo: rules.activeTo,
    });
    return false;
  }
  if (activeFromMs !== null && nowMs < activeFromMs) return false;
  if (activeToMs !== null && nowMs > activeToMs) return false;
  return true;
}

export function invalidateFeatureFlagCache(flagKey?: string): void {
  if (flagKey) {
    featureFlagCache.delete(flagKey);
    if (distributedCache) distributedCache.del(`${REDIS_FF_PREFIX}${flagKey}`).catch(() => {});
    return;
  }
  featureFlagCache.clear();
  if (distributedCache) distributedCache.flushPattern(`${REDIS_FF_PREFIX}*`).catch(() => {});
}

const REDIS_FF_PREFIX = "ff:";

export async function getFeatureFlag(flagKey: string): Promise<FeatureFlagView | null> {
  const now = Date.now();
  const ttl = cacheTtlMs();

  const localCached = featureFlagCache.get(flagKey);
  if (localCached && localCached.expiresAtMs > now) {
    return localCached.value;
  }

  if (distributedCache) {
    try {
      const remoteCached = await distributedCache.get(`${REDIS_FF_PREFIX}${flagKey}`);
      if (remoteCached !== null) {
        const view = JSON.parse(remoteCached) as FeatureFlagView | null;
        featureFlagCache.set(flagKey, { value: view, expiresAtMs: now + ttl });
        return view;
      }
    } catch {
      /* distributed cache miss or error — fall through to DB */
    }
  }

  const result = await query(
    `SELECT flag_key, enabled, rollout_percentage, description, rules_jsonb, updated_at, updated_by_user_id
     FROM feature_flag
     WHERE flag_key = $1`,
    [flagKey]
  );
  const row = result.rows[0] as FeatureFlagRow | undefined;
  const view = row ? toFeatureFlagView(row) : null;

  featureFlagCache.set(flagKey, { value: view, expiresAtMs: now + ttl });

  if (distributedCache) {
    distributedCache.set(`${REDIS_FF_PREFIX}${flagKey}`, JSON.stringify(view), ttl).catch(() => {});
  }

  return view;
}

export async function isFeatureEnabled(context: FeatureFlagContext): Promise<boolean> {
  try {
    const flag = await getFeatureFlag(context.flagKey);
    if (!flag || !flag.enabled) return false;
    const rules = toFeatureFlagRules(flag.rules);
    const nowMs = Number.isFinite(context.nowMs) ? Number(context.nowMs) : Date.now();
    if (!evaluateTimeWindowRule(rules, nowMs, context.flagKey)) return false;
    if (!evaluateListRule(rules.authorityIds, context.authorityId)) return false;
    if (!evaluateListRule(rules.userIds, context.userId)) return false;
    if (!evaluateListRule(rules.userTypes, context.userType)) return false;
    if (!evaluateSystemRolesRule(rules.systemRoles, context.systemRoles)) return false;
    const rolloutPercentage = Math.max(0, Math.min(100, Number(flag.rolloutPercentage || 0)));
    if (rolloutPercentage >= 100) return true;
    if (rolloutPercentage <= 0) return false;
    const identity = context.userId || context.authorityId || "anonymous";
    const bucket = stableBucket(`${context.flagKey}:${identity}`);
    return bucket < rolloutPercentage;
  } catch (error) {
    logWarn("Feature flag evaluation failed; defaulting disabled", {
      flagKey: context.flagKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
