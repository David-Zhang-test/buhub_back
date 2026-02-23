import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Comment not found" } },
        { status: 404 }
      );
    }

    const existing = await prisma.commentBookmark.findUnique({
      where: { userId_commentId: { userId: user.id, commentId } },
    });

    if (existing) {
      await prisma.commentBookmark.delete({
        where: { userId_commentId: { userId: user.id, commentId } },
      });
      return NextResponse.json({
        success: true,
        data: { bookmarked: false },
      });
    }

    await prisma.commentBookmark.create({
      data: { userId: user.id, commentId },
    });
    return NextResponse.json({
      success: true,
      data: { bookmarked: true },
    });
  } catch (error) {
    return handleError(error);
  }
}
