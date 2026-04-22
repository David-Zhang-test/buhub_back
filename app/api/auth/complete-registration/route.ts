import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
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
    const { registrationToken, password, agreedToTerms } = parsed;

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

    const passwordHash = await bcrypt.hash(password, 12);
    const { avatar, nickname } = await authService.generateRandomProfile(email, "tc");
    const userName = `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const user = await prisma.$transaction(async (tx) => {
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

      return createdUser;
    });

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
