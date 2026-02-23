import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    await authService.logoutAllSessions(user.id);
    await prisma.user.delete({
      where: { id: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
