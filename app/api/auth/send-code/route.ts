import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { sendEmail } from "@/src/lib/email";
import { isTempMail } from "@/src/lib/temp-mail";
import { handleError } from "@/src/lib/errors";
import { sendCodeSchema } from "@/src/schemas/auth.schema";

const CODE_TTL = 600; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    console.log("[send-code] 1. Parsing body...");
    const body = await req.json();
    const { email } = sendCodeSchema.parse(body);
    console.log("[send-code] 2. Email parsed:", email);

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
    console.log("[send-code] 3. Storing code in Redis...");
    await redis.setex(`email_verify:${email}`, CODE_TTL, code);
    console.log("[send-code] 4. Redis OK. Sending email (dev=console only)...");
    await sendEmail({
      to: email,
      subject: "BUHUB Verification Code",
      text: `Your verification code is: ${code}. Valid for 10 minutes.`,
    });

    console.log("[send-code] 5. Success. Code:", code);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[send-code] Error:", error);
    return handleError(error);
  }
}
