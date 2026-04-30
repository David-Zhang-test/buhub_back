import jwt, { TokenExpiredError } from "jsonwebtoken";
import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { UnauthorizedError } from "@/src/lib/errors";
import { generateProfileIdentity } from "@/src/lib/profile-identity";
import type { AppLanguage } from "@/src/lib/language";
import { getPrimaryEmailForUser } from "@/src/lib/user-emails";

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
const JWT_EXPIRY = "7d";
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
// 6-digit numeric reset code (must match the existing mobile UI which has
// 6 input boxes). Brute-force resistance is provided by the per-token and
// per-IP failure throttles in reset-password/route.ts plus the 30-min TTL.
const RESET_CODE_LENGTH = 6;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateResetCode(): string {
  let result = "";
  for (let i = 0; i < RESET_CODE_LENGTH; i += 1) {
    // crypto.randomInt is uniform and CSPRNG-backed; Math.random() is not.
    result += randomInt(0, 10).toString();
  }
  return result;
}

export class AuthService {
  /**
   * Create JWT session token
   */
  async createSession(userId: string, loginEmail?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const jti = crypto.randomUUID();
    const resolvedLoginEmail =
      loginEmail ?? (await getPrimaryEmailForUser(userId));

    await redis.setex(
      `session:${jti}`,
      SESSION_TTL,
      JSON.stringify({
        userId,
        role: user.role,
        loginEmail: resolvedLoginEmail,
        createdAt: Date.now(),
      })
    );

    const token = jwt.sign(
      { userId, jti, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return { token };
  }

  /**
   * Verify JWT and check session in Redis
   */
  async verifySession(token: string) {
    let decoded: { userId: string; jti: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        jti: string;
      };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        // JWT 过期，视为会话过期
        throw new UnauthorizedError("Session expired");
      }
      // 其他 JWT 问题，一律当成未授权
      throw new UnauthorizedError("Unauthorized");
    }

    const sessionJson = await redis.get(`session:${decoded.jti}`);
    if (!sessionJson) throw new UnauthorizedError("Session expired");

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    if (!user || !user.isActive || user.isBanned) {
      throw new UnauthorizedError("Account disabled");
    }

    return { user };
  }

  /**
   * Logout - delete session from Redis
   */
  async logout(jti: string) {
    await redis.del(`session:${jti}`);
  }

  /**
   * Create verification token for email/password reset
   */
  async createVerificationToken(userId: string, type: string) {
    const ttlMs =
      type === "password_reset" ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFICATION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);
    // Larger code space + more retries: keeps user-facing errors rare even
    // when many resets are concurrently active.
    const maxAttempts = type === "password_reset" ? 10 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const token = type === "password_reset" ? generateResetCode() : crypto.randomUUID();
      try {
        await prisma.verificationToken.create({
          data: {
            token,
            userId,
            type,
            expiresAt,
          },
        });
        return token;
      } catch (error) {
        const isUniqueViolation =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (type === "password_reset" && isUniqueViolation && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("Failed to generate password reset code");
  }

  async logoutAllSessions(userId: string) {
    const stream = redis.scanStream({ match: "session:*", count: 100 });
    for await (const keys of stream) {
      for (const key of keys as string[]) {
        const data = await redis.get(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.userId === userId) {
              await redis.del(key);
            }
          } catch {
            // Skip malformed session data
          }
        }
      }
    }
  }

  async deleteAccount(userId: string) {
    await this.logoutAllSessions(userId);
    await redis.del(`user:${userId}`);
    await redis.del(`blocked:${userId}`);

    // De-identify: strip all PII but keep the record for content integrity
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: null,
        userName: null,
        name: null,
        nickname: "Deleted User",
        avatar: "",
        bio: "",
        grade: null,
        major: null,
        gender: "other",
        isActive: false,
        agreedToTerms: false,
        agreedToTermsAt: null,
        lastLoginAt: null,
      },
    });

    // Remove identity-linked private data
    await prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.account.deleteMany({ where: { userId } }),
        tx.userEmail.deleteMany({ where: { userId } }),
        tx.verificationToken.deleteMany({ where: { userId } }),
        tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
        tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
        tx.pushToken.deleteMany({ where: { userId } }),
        tx.notification.deleteMany({ where: { userId } }),
        tx.directMessage.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } }),
        tx.like.deleteMany({ where: { userId } }),
        tx.bookmark.deleteMany({ where: { userId } }),
        tx.commentBookmark.deleteMany({ where: { userId } }),
      ]);
    });
  }

  /**
   * Generate random profile for new users
   */
  async generateRandomProfile(seedInput: string, language: AppLanguage = "tc") {
    return generateProfileIdentity(seedInput, language);
  }
}

export const authService = new AuthService();
