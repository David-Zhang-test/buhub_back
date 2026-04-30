import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/src/services/auth.service";
import { sendEmail } from "@/src/lib/email";
import { handleError } from "@/src/lib/errors";
import {
  checkCustomRateLimit,
  checkRateLimit,
  getClientIdentifier,
} from "@/src/lib/rate-limit";
import { findLoginIdentityByEmail, normalizeEmail } from "@/src/lib/user-emails";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

// Per-email throttle. Caps mailbox-flood and SMTP-relay abuse without
// leaking which email is rate-limited (response is unchanged either way).
const FORGOT_EMAIL_PER_MIN = 1;
const FORGOT_EMAIL_PER_DAY = 5;
const FORGOT_EMAIL_MIN_WINDOW_MS = 60 * 1000;
const FORGOT_EMAIL_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const id = getClientIdentifier(req);
    const { allowed } = await checkRateLimit(`${id}:forgot-password`, "rl:auth");
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = schema.parse(body);
    const email = normalizeEmail(parsed.email);

    const user = (await findLoginIdentityByEmail(email))?.user;

    // Per-email throttle. Computed AFTER the user lookup so the response
    // timing of "user exists" vs "doesn't exist" is harder to distinguish,
    // and AFTER the IP cap so a malicious IP cannot burn a victim's daily
    // budget with a single request that we never would have processed.
    const [emailMinOk, emailDayOk] = await Promise.all([
      checkCustomRateLimit(
        `rl:forgot:email:${email}`,
        FORGOT_EMAIL_MIN_WINDOW_MS,
        FORGOT_EMAIL_PER_MIN
      ),
      checkCustomRateLimit(
        `rl:forgot:email:day:${email}`,
        FORGOT_EMAIL_DAY_WINDOW_MS,
        FORGOT_EMAIL_PER_DAY
      ),
    ]);

    if (user && emailMinOk.allowed && emailDayOk.allowed) {
      const token = await authService.createVerificationToken(user.id, "password_reset");
      await sendEmail({
        to: email,
        subject: "ULink - Reset your password",
        text: `Your password reset code:\n\n${token}\n\nOpen the ULink app and paste this code to reset your password.\nThis code expires in 30 minutes.\n\nIf you didn't request this, please ignore this email.`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "If your email is registered, you will receive a password reset link",
    });
  } catch (error) {
    return handleError(error);
  }
}
