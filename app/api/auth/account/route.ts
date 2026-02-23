import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await authService.deleteAccount(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
