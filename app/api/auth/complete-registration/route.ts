import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { createInviteCodesForUser, normalizeInviteCode } from "@/src/lib/invite-codes";
import { isLifeHkbuEmail } from "@/src/lib/email-domain";
import {
  createUserEmail,
  isEmailLinked,
  normalizeEmail,
  USER_EMAIL_TYPE_HKBU,
  USER_EMAIL_TYPE_PRIMARY,
} from "@/src/lib/user-emails";
import { z } from "zod";
import bcrypt from "bcrypt";

const completeRegistrationSchema = z.object({
  email: z.string().email(),
  registrationToken: z.string().min(1),
  password: z.string().min(8).max(100),
  inviteCode: z.string().min(1),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms of service" }),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:complete-registration`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = completeRegistrationSchema.parse(body);
    const email = normalizeEmail(parsed.email);
    const { registrationToken, password, inviteCode, agreedToTerms } = parsed;

    const stored = await redis.get(`reg_token:${registrationToken}`);
    if (!stored) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REGISTRATION_TOKEN",
            message: "Registration link expired. Please start over.",
          },
        },
        { status: 400 }
      );
    }

    const { email: storedEmail } = JSON.parse(stored) as { email: string };
    if (storedEmail !== email) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMAIL_MISMATCH",
            message: "Email does not match verification",
          },
        },
        { status: 400 }
      );
    }

    if (await isEmailLinked(email)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "This email is already registered. Please log in.",
          },
        },
        { status: 400 }
      );
    }

    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    const invite = await prisma.inviteCode.findUnique({
      where: { code: normalizedInviteCode },
      select: { id: true, usedByUserId: true },
    });

    if (!invite || invite.usedByUserId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INVITE_CODE",
            message: "Invite code is invalid or already used",
          },
        },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { avatar, nickname } = await authService.generateRandomProfile(email, "tc");
    const userName = `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    let user: { id: string };
    try {
      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            passwordHash,
            userName,
            nickname,
            avatar,
            agreedToTerms,
            agreedToTermsAt: new Date(),
          },
        });

        await createUserEmail(tx, {
          userId: createdUser.id,
          email,
          type: isLifeHkbuEmail(email) ? USER_EMAIL_TYPE_HKBU : USER_EMAIL_TYPE_PRIMARY,
          canLogin: true,
          verifiedAt: new Date(),
        });

        const consumeResult = await tx.inviteCode.updateMany({
          where: {
            id: invite.id,
            usedByUserId: null,
          },
          data: {
            usedByUserId: createdUser.id,
            usedAt: new Date(),
          },
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
            error: {
              code: "INVITE_CODE_ALREADY_USED",
              message: "Invite code has been used",
            },
          },
          { status: 400 }
        );
      }
      throw error;
    }

    await redis.del(`reg_token:${registrationToken}`);

    const { token } = await authService.createSession(user.id, email);

    return NextResponse.json({
      success: true,
      token,
    });
  } catch (error) {
    return handleError(error, req);
  }
}
