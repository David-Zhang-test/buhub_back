import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import {
  findLoginIdentityByEmail,
  normalizeEmail,
} from "@/src/lib/user-emails";
import { z } from "zod";
import bcrypt from "bcrypt";
import { assertStrongPassword } from "@/src/schemas/auth.schema";

// Backwards-compatible schema: pre-existing mobile binaries do not send
// `email`; new clients send it so we can verify token ownership. Both shapes
// share the same response surface (message + optional token/user).
const schema = z.object({
  email: z.string().email().optional(),
  token: z.string(),
  newPassword: z.string().max(100),
});

// Per-IP failure throttle. Caps brute-force across many tokens.
const RESET_FAIL_MAX_PER_IP = 5;
const RESET_FAIL_WINDOW_SECONDS = 10 * 60;

// Per-token failure throttle. Burns a token after a few wrong guesses so an
// attacker cannot keep grinding against a single live token even from
// multiple IPs. Compensates for old clients that omit the email binding.
const RESET_FAIL_MAX_PER_TOKEN = 3;
const RESET_TOKEN_FAIL_WINDOW_SECONDS = 30 * 60;

function getResetFailKeys(clientId: string) {
  return {
    ipKey: `rl:reset:fail:ip:${clientId}`,
    lockKey: `rl:reset:lock:ip:${clientId}`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:reset-password`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const { ipKey, lockKey } = getResetFailKeys(id);
    if (await redis.get(lockKey)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many failed attempts. Please request a new reset code.",
          },
        },
        { status: 429, headers: { "Retry-After": String(RESET_FAIL_WINDOW_SECONDS) } }
      );
    }

    const body = await req.json();
    const parsed = schema.parse(body);
    const suppliedEmail = parsed.email ? normalizeEmail(parsed.email) : null;
    const { token, newPassword } = parsed;
    assertStrongPassword(newPassword);

    const tokenFailKey = `rl:reset:fail:token:${token}`;

    const recordFailure = async (alsoBurnToken: boolean) => {
      const ipFailCount = await redis.incr(ipKey);
      await redis.expire(ipKey, RESET_FAIL_WINDOW_SECONDS);
      if (ipFailCount >= RESET_FAIL_MAX_PER_IP) {
        await redis.set(lockKey, "1", "EX", RESET_FAIL_WINDOW_SECONDS);
      }
      if (alsoBurnToken) {
        const tokenFailCount = await redis.incr(tokenFailKey);
        await redis.expire(tokenFailKey, RESET_TOKEN_FAIL_WINDOW_SECONDS);
        if (tokenFailCount >= RESET_FAIL_MAX_PER_TOKEN) {
          // Burn: delete the row so subsequent attempts cannot succeed.
          await prisma.verificationToken
            .delete({ where: { token } })
            .catch(() => {});
        }
      }
    };

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    // Unknown / wrong-type token: don't even count against per-token (the
    // attacker doesn't know what's a real token). Still bump per-IP.
    if (!verificationToken || verificationToken.type !== "password_reset") {
      await recordFailure(false);
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_TOKEN", message: "Invalid reset code" },
        },
        { status: 400 }
      );
    }

    // Expired: keep the legacy error code so old clients' i18n still maps it.
    if (new Date() > verificationToken.expiresAt) {
      await prisma.verificationToken
        .delete({ where: { token } })
        .catch(() => {});
      await recordFailure(false);
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOKEN_EXPIRED", message: "Reset code has expired" },
        },
        { status: 400 }
      );
    }

    // Email-binding check (only when client provides email). New clients
    // hit this branch; old clients (no email) skip it but are still capped
    // by the per-token throttle below.
    if (suppliedEmail) {
      const identity = await findLoginIdentityByEmail(suppliedEmail);
      const wrongOwner =
        !identity?.user || verificationToken.userId !== identity.user.id;
      if (wrongOwner) {
        await recordFailure(true);
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_TOKEN", message: "Invalid reset code" },
          },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: verificationToken.userId },
    });
    if (!user) {
      await recordFailure(true);
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_TOKEN", message: "Invalid reset code" },
        },
        { status: 400 }
      );
    }

    const primaryEmail = suppliedEmail ?? undefined;
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, lastLoginAt: new Date() },
    });

    await prisma.verificationToken.delete({ where: { token } });
    await authService.logoutAllSessions(user.id);
    await Promise.all([
      redis.del(ipKey),
      redis.del(lockKey),
      redis.del(tokenFailKey),
    ]);

    // Auto-login (new clients use this; old clients ignore extra fields).
    const { token: sessionToken } = await authService.createSession(
      user.id,
      primaryEmail
    );

    const language =
      user.language === "zh-TW"
        ? "tc"
        : user.language === "zh-CN"
          ? "sc"
          : user.language ?? "en";

    const userPayload = {
      id: user.id,
      name: user.name ?? user.userName ?? user.nickname,
      nickname: user.nickname,
      email: primaryEmail ?? null,
      avatar: user.avatar,
      grade: user.grade ?? "",
      major: user.major ?? "",
      bio: user.bio ?? "",
      gender: user.gender ?? "other",
      language,
      userName: user.userName,
      role: user.role,
      isLoggedIn: true,
    };

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
      token: sessionToken,
      user: userPayload,
    });
  } catch (error) {
    return handleError(error);
  }
}
