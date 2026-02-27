import { redis } from "@/src/lib/redis";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // per window for auth endpoints

export async function checkRateLimit(identifier: string, prefix = "rl"): Promise<{ allowed: boolean }> {
  const key = `${prefix}:${identifier}`;
  const multi = redis.multi();
  multi.incr(key);
  multi.pttl(key);
  const results = await multi.exec();
  if (!results) return { allowed: false };

  const count = results[0]?.[1] as number;
  const ttl = results[1]?.[1] as number;

  if (ttl === -1) {
    await redis.pexpire(key, WINDOW_MS);
  }

  return { allowed: count <= MAX_REQUESTS };
}

export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
