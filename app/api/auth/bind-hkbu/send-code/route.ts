import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { sendEmail } from "@/src/lib/email";
import { isTempMail } from "@/src/lib/temp-mail";
import { handleError, AppError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { ensureUserCanLinkAnotherEmail, getLinkedEmailsForUser, isEmailLinked, normalizeEmail } from "@/src/lib/user-emails";
import { z } from "zod";

const CODE_TTL = 600;
const schema = z.object({
  email: z.string().email(),
});

function buildRedisKey(userId: string, email: string) {
  return `bind_hkbu_verify:${userId}:${email}`;
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:bind-hkbu-send-code`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = schema.parse(body);
    const email = normalizeEmail(parsed.email);

    if (isTempMail(email)) {
      throw new AppError("Temporary emails not allowed", 400, "INVALID_EMAIL");
    }

    const linkedEmails = await getLinkedEmailsForUser(user.id);
    const alreadyLinkedByUser = linkedEmails.some((item) => item.email === email);
    if (alreadyLinkedByUser) {
      throw new AppError("This email is already linked to your account", 400, "EMAIL_ALREADY_LINKED");
    }

    await ensureUserCanLinkAnotherEmail(user.id);

    if (await isEmailLinked(email)) {
      throw new AppError("This email is already linked to another account", 400, "EMAIL_IN_USE");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.setex(buildRedisKey(user.id, email), CODE_TTL, code);
    await sendEmail({
      to: email,
      subject: "ULink Email Verification Code",
      text: `Your verification code is: ${code}. Valid for 10 minutes.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, req);
  }
}

