import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";
import { authService } from "@/src/services/auth.service";

const updateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN", "MODERATOR"]).optional(),
  isActive: z.boolean().optional(),
  isBanned: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireRole(req, "ADMIN");
    const { id } = await params;
    const body = await req.json();
    const data = updateUserSchema.parse(body);

    if (id === admin.id && data.role && data.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot demote yourself" } },
        { status: 403 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    const shouldInvalidateSessions =
      (data.isBanned === true && !target.isBanned) || (data.isActive === false && target.isActive);
    if (shouldInvalidateSessions) {
      await authService.logoutAllSessions(id);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isBanned !== undefined && { isBanned: data.isBanned }),
      },
      select: {
        id: true,
        emails: { select: { email: true } },
        userName: true,
        nickname: true,
        role: true,
        isActive: true,
        isBanned: true,
      },
    });

    const formattedUser = {
      ...updated,
      email: updated.emails[0]?.email || null,
    };

    return NextResponse.json({ success: true, data: formattedUser });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireRole(req, "ADMIN");
    const { id } = await params;

    if (id === admin.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot delete yourself" } },
        { status: 403 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    await authService.logoutAllSessions(id);
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
