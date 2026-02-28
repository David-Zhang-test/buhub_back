import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { verifyCodeSchema } from "@/src/schemas/auth.schema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code } = verifyCodeSchema.parse(body);

    const storedCode = await redis.get(`email_verify:${email}`);
    if (!storedCode || storedCode !== code) {
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

    await redis.del(`email_verify:${email}`);

    const user = await prisma.user.findUnique({ where: { email } });

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

      const { token } = await authService.createSession(user.id);

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
