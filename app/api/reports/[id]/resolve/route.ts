import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const resolveSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "MODERATOR");
    const { id } = await params;
    const body = await req.json();
    const { status } = resolveSchema.parse(body);

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Report not found" } },
        { status: 404 }
      );
    }

    await prisma.report.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
