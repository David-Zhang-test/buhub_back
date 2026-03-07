import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { sendEmail } from "@/src/lib/email";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { createInviteCodesForUser, normalizeInviteCode } from "@/src/lib/invite-codes";
import { isAllowedRegistrationEmail, allowedRegistrationEmailDomain } from "@/src/lib/email-domain";
import { z } from "zod";
import bcrypt from "bcrypt";

const registerSchema = z.object({
  email: z
    .string()
    .email()
    .refine((email) => isAllowedRegistrationEmail(email), {
      message: `Only @${allowedRegistrationEmailDomain} emails are allowed`,
    }),
  password: z.string().min(8).max(100),
  nickname: z.string().min(2).max(50),
  inviteCode: z.string().min(1),
  language: z.enum(["en", "zh-CN", "zh-TW"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:register`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

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

    const normalizedInviteCode = normalizeInviteCode(data.inviteCode);
    const invite = await prisma.inviteCode.findUnique({
      where: { code: normalizedInviteCode },
      select: { id: true, usedByUserId: true },
    });
    if (!invite || invite.usedByUserId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INVITE_CODE", message: "Invite code is invalid or already used" },
        },
        { status: 400 }
      );
    }

    let user: { id: string };
    try {
      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
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

        const consumeResult = await tx.inviteCode.updateMany({
          where: { id: invite.id, usedByUserId: null },
          data: { usedByUserId: createdUser.id, usedAt: new Date() },
        });

        if (consumeResult.count !== 1) {
          throw new Error("INVITE_CODE_ALREADY_USED");
        }

        await createInviteCodesForUser(tx, createdUser.id, 3);
        return createdUser;
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "INVITE_CODE_ALREADY_USED") {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVITE_CODE_ALREADY_USED", message: "Invite code has been used" },
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const token = await authService.createVerificationToken(user.id, "email_verification");

    await sendEmail({
      to: data.email,
      subject: "UHUB - Verify your email",
      text: `Verify your email: ${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/verify?token=${token}`,
    });

    return NextResponse.json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
    });
  } catch (error) {
    return handleError(error);
  }
}
