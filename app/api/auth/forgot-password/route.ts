import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/src/services/auth.service";
import { sendEmail } from "@/src/lib/email";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
import { findLoginIdentityByEmail, normalizeEmail } from "@/src/lib/user-emails";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

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

    if (user) {
      const token = await authService.createVerificationToken(user.id, "password_reset");
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
      await sendEmail({
        to: email,
        subject: "ULink - Reset your password",
        text: `Your password reset code:\n\n${token}\n\nOpen the ULink app and paste this code to reset your password.\nThis code expires in 24 hours.\n\nIf you didn't request this, please ignore this email.`,
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
