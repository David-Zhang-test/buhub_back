import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

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

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isBanned !== undefined && { isBanned: data.isBanned }),
      },
      select: {
        id: true,
        email: true,
        userName: true,
        nickname: true,
        role: true,
        isActive: true,
        isBanned: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}
