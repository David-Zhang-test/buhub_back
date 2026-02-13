import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { sendEmail } from "@/src/lib/email";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";
import bcrypt from "bcrypt";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  nickname: z.string().min(2).max(50),
  language: z.enum(["en", "zh-CN", "zh-TW"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_EXISTS", message: "Email already registered" } },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const { avatar } = await authService.generateRandomProfile();
    const userName = `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        nickname: data.nickname,
        avatar,
        userName,
        language: data.language ?? "en",
        emailVerified: false,
        agreedToTerms: true,
        agreedToTermsAt: new Date(),
        accounts: {
          create: {
            type: "email",
            provider: "email",
            providerAccountId: data.email,
          },
        },
      },
    });

    const token = await authService.createVerificationToken(user.id, "email_verification");

    await sendEmail({
      to: data.email,
      subject: "BUHUB - Verify your email",
      text: `Verify your email: ${process.env.NEXT_PUBLIC_APP_URL || "https://app.buhub.com"}/verify?token=${token}`,
    });

    return NextResponse.json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
    });
  } catch (error) {
    return handleError(error);
  }
}
