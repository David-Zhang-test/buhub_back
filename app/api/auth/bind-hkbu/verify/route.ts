import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { prisma } from "@/src/lib/db";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError, AppError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { isLifeHkbuEmail } from "@/src/lib/email-domain";
import {
  ensureUserCanLinkAnotherEmail,
  getLinkedEmailsForUser,
  getVerifiedHkbuEmailForUser,
  isEmailLinked,
  normalizeEmail,
  serializeLinkedEmail,
  USER_EMAIL_TYPE_HKBU,
  USER_EMAIL_TYPE_PRIMARY,
} from "@/src/lib/user-emails";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

function buildRedisKey(userId: string, email: string) {
  return `bind_hkbu_verify:${userId}:${email}`;
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:bind-hkbu-verify`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = schema.parse(body);
    const email = normalizeEmail(parsed.email);
    const { code } = parsed;

    const storedCode = await redis.get(buildRedisKey(user.id, email));
    if (!storedCode || storedCode !== code) {
      throw new AppError("Invalid or expired verification code", 400, "INVALID_CODE");
    }

    const linkedEmails = await getLinkedEmailsForUser(user.id);
    const existingOwnLink = linkedEmails.find((item) => item.email === email);
    const emailType = isLifeHkbuEmail(email) ? USER_EMAIL_TYPE_HKBU : USER_EMAIL_TYPE_PRIMARY;
    if (!existingOwnLink) {
      await ensureUserCanLinkAnotherEmail(user.id);
      if (await isEmailLinked(email)) {
        throw new AppError("This email is already linked to another account", 400, "EMAIL_IN_USE");
      }
    }

    await prisma.$transaction(async (tx) => {
      if (existingOwnLink) {
        await tx.userEmail.update({
          where: { id: existingOwnLink.id },
          data: {
            canLogin: true,
            verifiedAt: new Date(),
            type: emailType,
          },
        });
      } else {
        await tx.userEmail.create({
          data: {
            userId: user.id,
            email,
            type: emailType,
            canLogin: true,
            verifiedAt: new Date(),
          },
        });
        await tx.account.create({
          data: {
            userId: user.id,
            type: "email",
            provider: "email",
            providerAccountId: email,
          },
        });
      }
    });

    await redis.del(buildRedisKey(user.id, email));

    const [nextLinkedEmails, hkbuEmailRecord] = await Promise.all([
      getLinkedEmailsForUser(user.id),
      getVerifiedHkbuEmailForUser(user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        linkedEmails: nextLinkedEmails.map((item) => serializeLinkedEmail(item, user.email)),
        isHKBUVerified: Boolean(hkbuEmailRecord),
        hkbuEmail: hkbuEmailRecord?.email,
      },
    });
  } catch (error) {
    return handleError(error, req);
  }
}
