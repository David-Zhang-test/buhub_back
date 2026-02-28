import { redis } from "@/src/lib/redis";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // per window for auth endpoints

/** Send-code: 1 per email per 60s, 5 per IP per 60s */
const SEND_CODE_EMAIL_WINDOW_MS = 60 * 1000;
const SEND_CODE_IP_WINDOW_MS = 60 * 1000;
const SEND_CODE_MAX_PER_EMAIL = 1;
const SEND_CODE_MAX_PER_IP = 5;

async function checkLimit(key: string, windowMs: number, maxRequests: number): Promise<boolean> {
  const multi = redis.multi();
  multi.incr(key);
  multi.pttl(key);
  const results = await multi.exec();
  if (!results) return false;
  const count = results[0]?.[1] as number;
  const ttl = results[1]?.[1] as number;
  if (ttl === -1) await redis.pexpire(key, windowMs);
  return count <= maxRequests;
}

export async function checkSendCodeRateLimit(
  email: string,
  ip: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const emailKey = `rl:sendcode:email:${email.toLowerCase()}`;
  const ipKey = `rl:sendcode:ip:${ip}`;
  const [emailOk, ipOk] = await Promise.all([
    checkLimit(emailKey, SEND_CODE_EMAIL_WINDOW_MS, SEND_CODE_MAX_PER_EMAIL),
    checkLimit(ipKey, SEND_CODE_IP_WINDOW_MS, SEND_CODE_MAX_PER_IP),
  ]);
  if (!emailOk) return { allowed: false, retryAfterSeconds: 60 };
  if (!ipOk) return { allowed: false, retryAfterSeconds: 60 };
  return { allowed: true };
}

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
