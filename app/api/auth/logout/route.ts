import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { jti } = await getCurrentUser(req);

    await authService.logout(jti);

    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return handleError(error);
  }
}
