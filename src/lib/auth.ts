import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { UnauthorizedError } from "@/src/lib/errors";

const WEAK_SECRET_PATTERNS = [
  "change-me-in-production",
  "change-this-to-a-secure-random-string",
  "your-secret-key",
  "your-secret",
];

function isWeakSecret(s: string): boolean {
  const lower = s.toLowerCase();
  return WEAK_SECRET_PATTERNS.some((p) => lower.includes(p));
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || isWeakSecret(secret)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set to a strong random string in production");
    }
    return "dev-secret-not-for-production";
  }
  return secret;
}
const JWT_SECRET = getJwtSecret();
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  userId: string;
  jti: string;
  role: string;
}

export interface SessionData {
  userId: string;
  role: string;
  createdAt: number;
  lastUsedAt?: number;
}

/**
 * Get current user from request (verifies JWT and validates session in Redis)
 */
export async function getCurrentUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new UnauthorizedError("Missing authorization token");
  }

  const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload;

  const sessionJson = await redis.get(`session:${decoded.jti}`);
  if (!sessionJson) {
    throw new UnauthorizedError("Session expired");
  }

  const session: SessionData = JSON.parse(sessionJson);

  // Optional: cache user in Redis
  const userCacheKey = `user:${session.userId}`;
  let userJson = await redis.get(userCacheKey);

  if (!userJson) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    await redis.setex(userCacheKey, 300, JSON.stringify(user));
    userJson = JSON.stringify(user);
  }

  const user = JSON.parse(userJson);

  if (!user.isActive) {
    throw new UnauthorizedError("Account deactivated");
  }

  if (user.isBanned) {
    throw new UnauthorizedError("Account banned");
  }

  // Refresh session TTL (async, non-blocking)
  session.lastUsedAt = Date.now();
  redis
    .setex(
      `session:${decoded.jti}`,
      SESSION_TTL,
      JSON.stringify(session)
    )
    .catch(console.error);

  return { user, session, jti: decoded.jti };
}

/**
 * Require specific role (ADMIN or MODERATOR)
 */
export async function requireRole(
  req: NextRequest,
  requiredRole: "ADMIN" | "MODERATOR"
) {
  const { user } = await getCurrentUser(req);

  if (requiredRole === "ADMIN" && user.role !== "ADMIN") {
    throw new UnauthorizedError("Admin access required");
  }

  if (
    requiredRole === "MODERATOR" &&
    user.role !== "MODERATOR" &&
    user.role !== "ADMIN"
  ) {
    throw new UnauthorizedError("Moderator access required");
  }

  return { user };
}
