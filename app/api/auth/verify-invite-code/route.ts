import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { prisma } from "@/src/lib/db";
import { normalizeInviteCode } from "@/src/lib/invite-codes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCode = typeof body.code === "string" ? body.code : "";
    const code = normalizeInviteCode(rawCode);

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_CODE",
            message: "Invite code is required",
          },
        },
        { status: 400 }
      );
    }

    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code },
      select: { id: true, usedByUserId: true },
    });

    const valid = Boolean(inviteCode && !inviteCode.usedByUserId);

    return NextResponse.json({
      success: true,
      valid,
      code,
    });
  } catch (error) {
    return handleError(error);
  }
}
