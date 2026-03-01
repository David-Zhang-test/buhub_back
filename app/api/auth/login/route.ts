import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { z } from "zod";
import bcrypt from "bcrypt";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:login`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_NOT_VERIFIED", message: "Please verify your email first" } },
        { status: 403 }
      );
    }

    if (!user.isActive || user.isBanned) {
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_DISABLED", message: "Account is disabled" } },
        { status: 403 }
      );
    }

    const { token } = await authService.createSession(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json({ success: true, token });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const msg = (err.message ?? "").toLowerCase();
    console.error("[auth/login] error:", err.message, err.cause ?? "");

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
