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
const JWT_EXPIRY = "7d";
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export class AuthService {
  /**
   * Create JWT session token
   */
  async createSession(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const jti = crypto.randomUUID();

    await redis.setex(
      `session:${jti}`,
      SESSION_TTL,
      JSON.stringify({
        userId,
        role: user.role,
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
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      jti: string;
    };

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
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await prisma.verificationToken.create({
      data: {
        token,
        userId,
        type,
        expiresAt,
      },
    });
    return token;
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
    await prisma.user.delete({ where: { id: userId } });
  }

  /**
   * Generate random profile for new users
   */
  async generateRandomProfile() {
    const avatars = ["avatar1.png", "avatar2.png", "avatar3.png"];
    const adjectives = ["Happy", "Clever", "Brave", "Swift", "Bright"];
    const nouns = ["Panda", "Tiger", "Eagle", "Dolphin", "Phoenix"];

    return {
      avatar: avatars[Math.floor(Math.random() * avatars.length)] ?? "avatar1.png",
      nickname: `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 1000)}`,
    };
  }
}

export const authService = new AuthService();
