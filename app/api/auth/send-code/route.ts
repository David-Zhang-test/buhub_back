import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { sendEmail } from "@/src/lib/email";
import { isTempMail } from "@/src/lib/temp-mail";
import { handleError } from "@/src/lib/errors";
import { sendCodeSchema } from "@/src/schemas/auth.schema";

const CODE_TTL = 600; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = sendCodeSchema.parse(body);

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await redis.setex(`email_verify:${email}`, CODE_TTL, code);

    await sendEmail({
      to: email,
      subject: "BUHUB Verification Code",
      text: `Your verification code is: ${code}. Valid for 10 minutes.`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
