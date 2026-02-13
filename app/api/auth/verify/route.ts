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

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const { avatar, nickname } = await authService.generateRandomProfile();

      user = await prisma.user.create({
        data: {
          email,
          emailVerified: true,
          nickname,
          avatar,
          agreedToTerms: true,
          agreedToTermsAt: new Date(),
          accounts: {
            create: {
              type: "email",
              provider: "email",
              providerAccountId: email,
            },
          },
        },
      });
    }

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
  } catch (error) {
    return handleError(error);
  }
}
