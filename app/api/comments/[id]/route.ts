import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;
    const body = await req.json();
    const { content } = updateCommentSchema.parse(body);

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { post: true },
    });

    if (!comment || comment.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Comment not found" } },
        { status: 404 }
      );
    }

    if (comment.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized to edit" } },
        { status: 403 }
      );
    }

    await prisma.comment.update({
      where: { id },
      data: { content },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { post: true },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Comment not found" } },
        { status: 404 }
      );
    }

    if (comment.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized to delete" } },
        { status: 403 }
      );
    }

    await prisma.comment.update({
      where: { id },
      data: { isDeleted: true },
    });

    const replyCount = await prisma.comment.count({
      where: { parentId: id, isDeleted: false },
    });

    await prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 + replyCount } },
    });

    await prisma.comment.updateMany({
      where: { parentId: id },
      data: { isDeleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
