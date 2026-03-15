import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { verifyCodeSchema } from "@/src/schemas/auth.schema";
import { getClientIdentifier } from "@/src/lib/rate-limit";
import { findLoginIdentityByEmail, normalizeEmail } from "@/src/lib/user-emails";

const VERIFY_FAIL_MAX_ATTEMPTS = 5;
const VERIFY_FAIL_WINDOW_SECONDS = 10 * 60; // 10 minutes lock window

function getVerifyFailKeys(email: string, clientId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return {
    emailKey: `rl:verify:fail:email:${normalizedEmail}`,
    ipKey: `rl:verify:fail:ip:${clientId}`,
    lockKey: `rl:verify:lock:${normalizedEmail}:${clientId}`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verifyCodeSchema.parse(body);
    const email = normalizeEmail(parsed.email);
    const { code } = parsed;
    const clientId = getClientIdentifier(req);
    const { emailKey, ipKey, lockKey } = getVerifyFailKeys(email, clientId);

    const locked = await redis.get(lockKey);
    if (locked) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many failed attempts. Please try again later.",
          },
        },
        { status: 429, headers: { "Retry-After": String(VERIFY_FAIL_WINDOW_SECONDS) } }
      );
    }

    const storedCode = await redis.get(`email_verify:${email}`);
    if (!storedCode || storedCode !== code) {
      const [emailFailCount, ipFailCount] = await Promise.all([
        redis.incr(emailKey),
        redis.incr(ipKey),
      ]);
      await Promise.all([
        redis.expire(emailKey, VERIFY_FAIL_WINDOW_SECONDS),
        redis.expire(ipKey, VERIFY_FAIL_WINDOW_SECONDS),
      ]);

      if (emailFailCount >= VERIFY_FAIL_MAX_ATTEMPTS || ipFailCount >= VERIFY_FAIL_MAX_ATTEMPTS) {
        await redis.set(lockKey, "1", "EX", VERIFY_FAIL_WINDOW_SECONDS);
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CODE",
            message: "Invalid or expired verification code",
          },
        },
        { status: 400 }
      );
    }

    await Promise.all([redis.del(`email_verify:${email}`), redis.del(emailKey), redis.del(ipKey), redis.del(lockKey)]);

    const identity = await findLoginIdentityByEmail(email);
    const user = identity?.user;

    if (user) {
      // Existing user: create session and return JWT
      if (!user.isActive || user.isBanned) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ACCOUNT_DISABLED",
              message: "Account is disabled",
            },
          },
          { status: 403 }
        );
      }

      const { token } = await authService.createSession(user.id, email);

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return NextResponse.json({
        success: true,
        token,
      });
    }

    // New user: do NOT create user yet. Issue registration token for completing signup.
    const REG_TOKEN_TTL = 900; // 15 minutes
    const registrationToken = crypto.randomUUID().replace(/-/g, "");
    await redis.setex(
      `reg_token:${registrationToken}`,
      REG_TOKEN_TTL,
      JSON.stringify({ email })
    );

    return NextResponse.json({
      success: true,
      registrationToken,
      needsPassword: true,
    });
  } catch (error) {
    return handleError(error);
  }
}
