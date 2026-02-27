import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { z } from "zod";
import bcrypt from "bcrypt";

const schema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(100),
});

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

    const body = await req.json();
    const { token, newPassword } = schema.parse(body);

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken || verificationToken.type !== "password_reset") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } },
        { status: 400 }
      );
    }

    if (new Date() > verificationToken.expiresAt) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.json(
        { success: false, error: { code: "TOKEN_EXPIRED", message: "Reset link has expired" } },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { passwordHash },
    });

    await prisma.verificationToken.delete({ where: { token } });
    await authService.logoutAllSessions(verificationToken.userId);

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    return handleError(error);
  }
}
