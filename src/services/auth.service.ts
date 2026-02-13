import jwt from "jsonwebtoken";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { UnauthorizedError } from "@/src/lib/errors";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
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
