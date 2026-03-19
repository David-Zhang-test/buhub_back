import { NextRequest, NextResponse } from "next/server";
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

    // When report is approved (resolved), soft-delete the reported content
    if (status === "resolved") {
      if (report.postId) {
        await prisma.$transaction([
          prisma.comment.updateMany({
            where: { postId: report.postId },
            data: { isDeleted: true },
          }),
          prisma.post.update({
            where: { id: report.postId },
            data: { isDeleted: true },
          }),
        ]);
      }
      if (report.commentId) {
        await prisma.comment.update({
          where: { id: report.commentId },
          data: { isDeleted: true },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
