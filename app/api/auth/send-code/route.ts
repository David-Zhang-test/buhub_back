import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { sendEmail } from "@/src/lib/email";
import { isTempMail } from "@/src/lib/temp-mail";
import { handleError } from "@/src/lib/errors";
import { sendCodeSchema } from "@/src/schemas/auth.schema";
import { checkSendCodeRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { verifyHcaptchaToken } from "@/src/lib/hcaptcha";
import { isEmailLinked, normalizeEmail } from "@/src/lib/user-emails";

const CODE_TTL = 600; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = sendCodeSchema.parse(body);
    const email = normalizeEmail(parsed.email);
    const { captchaToken } = parsed;

    const ip = getClientIdentifier(req);
    const hcaptchaResult = await verifyHcaptchaToken(captchaToken, ip);
    if (!hcaptchaResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CAPTCHA_FAILED",
            message: "Captcha verification failed. Please try again.",
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
            message: "This email is already registered. Please log in with your password.",
          },
        },
        { status: 400 }
      );
    }

    if (isTempMail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_EMAIL",
            message: "Temporary emails not allowed",
          },
        },
        { status: 400 }
      );
    }

    const { allowed, retryAfterSeconds } = await checkSendCodeRateLimit(email, ip);
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: `Please wait ${retryAfterSeconds ?? 60} seconds before requesting another code`,
          },
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 60) } }
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.setex(`email_verify:${email}`, CODE_TTL, code);
    await sendEmail({
      to: email,
      subject: "ULink Verification Code",
      text: `Your verification code is: ${code}. Valid for 10 minutes.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[send-code] Error:", error);
    return handleError(error);
  }
}
