/**
 * M11: Redis-based distributed cache implementation.
 * Implements the DistributedCache interface consumed by feature-flags.ts.
 * Uses the `redis` v4 package (already a dependency).
 */
import { createClient, type RedisClientType } from "redis";
import { logInfo, logWarn } from "../logger";

export interface DistributedCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  flushPattern(pattern: string): Promise<void>;
}

let redisClient: RedisClientType | null = null;

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

/**
 * Create and connect a Redis client. Returns a DistributedCache adapter.
 * Call this at startup only when REDIS_URL is configured.
 */
export async function createRedisCache(url: string): Promise<DistributedCache> {
  const client = createClient({ url }) as RedisClientType;

  client.on("error", (err) => {
    logWarn("Redis client error", { error: err instanceof Error ? err.message : String(err) });
  });

  await client.connect();
  redisClient = client;
  logInfo("Redis distributed cache connected", { url: url.replace(/\/\/.*@/, "//<redacted>@") });

  return {
    async get(key: string): Promise<string | null> {
      return client.get(key);
    },

    async set(key: string, value: string, ttlMs: number): Promise<void> {
      await client.set(key, value, { PX: ttlMs });
    },

    async del(key: string): Promise<void> {
      await client.del(key);
    },

    /**
     * Flush keys matching a glob pattern using SCAN + DEL.
     * Safe for production — never uses KEYS *.
     */
    async flushPattern(pattern: string): Promise<void> {
      let cursor = 0;
      do {
        const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await client.del(result.keys);
        }
      } while (cursor !== 0);
    },
  };
}

/**
 * Gracefully disconnect the Redis client. Call on app shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
