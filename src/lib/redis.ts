import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true, // Defer connection until first command - avoids ECONNREFUSED during Next.js build
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
