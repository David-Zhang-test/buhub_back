import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";

/**
 * POST /api/auth/verify-invite-code
 *
 * Stub endpoint for invite-code verification during registration.
 * TODO: Implement actual invite code validation logic (e.g. check DB table,
 * rate limit, mark code as used, etc.)
 *
 * Body: { code: string }
 * Returns: { success: boolean, valid: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = typeof body.code === "string" ? body.code.trim() : "";

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

    // TODO: Replace with real invite-code validation
    // e.g. const inviteCode = await prisma.inviteCode.findUnique({ where: { code } });
    // For now, accept any non-empty code
    const valid = code.length > 0;

    return NextResponse.json({
      success: true,
      valid,
    });
  } catch (error) {
    return handleError(error);
  }
}
