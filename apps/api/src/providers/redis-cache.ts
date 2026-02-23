import { createClient, type RedisClientType } from "redis";
import { logWarn } from "../logger";

let client: RedisClientType | null = null;
let isConnected = false;

export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (client && isConnected) return client;

  try {
    client = createClient({ url: redisUrl }) as RedisClientType;
    client.on("error", (err) => {
      logWarn("Redis connection error", { error: String(err) });
      isConnected = false;
    });
    client.on("connect", () => { isConnected = true; });
    client.on("end", () => { isConnected = false; });
    await client.connect();
    isConnected = true;
    return client;
  } catch (err) {
    logWarn("Failed to connect to Redis; feature flag cache will be local-only", {
      error: err instanceof Error ? err.message : String(err),
    });
    client = null;
    isConnected = false;
    return null;
  }
}

export function createRedisDistributedCache() {
  return {
    async get(key: string): Promise<string | null> {
      const c = await getRedisClient();
      if (!c) return null;
      return c.get(key);
    },

    async set(key: string, value: string, ttlMs: number): Promise<void> {
      const c = await getRedisClient();
      if (!c) return;
      await c.set(key, value, { PX: ttlMs });
    },

    async del(key: string): Promise<void> {
      const c = await getRedisClient();
      if (!c) return;
      await c.del(key);
    },

    async flushPattern(pattern: string): Promise<void> {
      const c = await getRedisClient();
      if (!c) return;
      const keys = await c.keys(pattern);
      if (keys.length > 0) {
        await c.del(keys);
      }
    },
  };
}

export async function shutdownRedis(): Promise<void> {
  if (client && isConnected) {
    try {
      await client.quit();
    } catch { /* ignore */ }
  }
  client = null;
  isConnected = false;
}
