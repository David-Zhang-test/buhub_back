import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { sendEmail } from "@/src/lib/email";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = await authService.createVerificationToken(user.id, "password_reset");
      await sendEmail({
        to: email,
        subject: "BUHUB - Reset your password",
        text: `Reset your password: ${process.env.NEXT_PUBLIC_APP_URL || "https://app.buhub.com"}/reset-password?token=${token}`,
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
