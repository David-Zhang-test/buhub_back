import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { findLoginIdentityByEmail, normalizeEmail } from "@/src/lib/user-emails";
import { child } from "@/src/lib/logger";
import { z } from "zod";
import bcrypt from "bcrypt";

const log = child("auth/login");

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function emailHint(email: string): string {
  if (!email || email.length < 3) return "?";
  return `***${email.slice(-2)}`;
}

export async function POST(req: NextRequest) {
  try {
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:login`, "rl:auth");
    if (!allowed) {
      log.warn("429 rate limited", { ip: id });
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = loginSchema.parse(body);
    const email = normalizeEmail(parsed.email);
    const { password } = parsed;
    log.info("attempt", { hint: emailHint(email), ip: id });

    const identity = await findLoginIdentityByEmail(email);
    const user = identity?.user;
    if (!user || !user.passwordHash) {
      log.warn("401 no user or no password", { hint: emailHint(email) });
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      log.warn("401 wrong password", { hint: emailHint(email) });
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    if (!identity?.linkedEmail || !identity.linkedEmail.verifiedAt) {
      log.warn("403 email not verified", { hint: emailHint(email) });
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_NOT_VERIFIED", message: "Please verify your email first" } },
        { status: 403 }
      );
    }

    if (!user.isActive || user.isBanned) {
      log.warn("403 account disabled", { hint: emailHint(email) });
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_DISABLED", message: "Account is disabled" } },
        { status: 403 }
      );
    }

    const { token } = await authService.createSession(user.id, email);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

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
      email: email,
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

    log.info("200 success", { hint: emailHint(email), userId: user.id });
    return NextResponse.json({ success: true, token, user: userPayload });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const msg = (err.message ?? "").toLowerCase();
    log.error("exception", { message: err.message, cause: err.cause });

    // Redis/DB/network unreachable on server → return 503 JSON (not HTML 500)
    const isUnavailable =
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("connect") ||
      msg.includes("redis") ||
      msg.includes("jwt_secret");
    if (isUnavailable) {
      return NextResponse.json(
        { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable" } },
        { status: 503 }
      );
    }

    return handleError(error, req);
  }
}
