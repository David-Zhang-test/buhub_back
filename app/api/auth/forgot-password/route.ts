import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { sendEmail } from "@/src/lib/email";
import { handleError } from "@/src/lib/errors";
import { checkRateLimit, getClientIdentifier } from "@/src/lib/rate-limit";
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
    const { email } = schema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = await authService.createVerificationToken(user.id, "password_reset");
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
      await sendEmail({
        to: email,
        subject: "BUHUB - Reset your password",
        text: `Reset your password: Go to ${baseUrl}/reset-password and enter this code:\n\n${token}\n\nThe code expires in 24 hours.`,
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
