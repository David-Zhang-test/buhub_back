import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { authService } from "@/src/services/auth.service";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";
import bcrypt from "bcrypt";

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8).max(100),
});

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { oldPassword, newPassword } = changePasswordSchema.parse(body);

    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser || !fullUser.passwordHash) {
      return NextResponse.json(
        { success: false, error: { code: "NO_PASSWORD", message: "Account has no password set" } },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(oldPassword, fullUser.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PASSWORD", message: "Current password is incorrect" } },
        { status: 401 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await authService.logoutAllSessions(user.id);

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    return handleError(error);
  }
}
