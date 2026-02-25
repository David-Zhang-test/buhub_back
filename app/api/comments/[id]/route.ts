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

    // Helper function to recursively get all descendant comment IDs
    async function getAllDescendantIds(parentId: string): Promise<string[]> {
      const children = await prisma.comment.findMany({
        where: { parentId, isDeleted: false },
        select: { id: true },
      });

      let allIds: string[] = [];
      for (const child of children) {
        allIds.push(child.id);
        const descendants = await getAllDescendantIds(child.id);
        allIds = allIds.concat(descendants);
      }
      return allIds;
    }

    // Check if this is a parent comment (has no parentId) or a reply (has parentId)
    const isParentComment = comment.parentId === null;

    if (isParentComment) {
      // Deleting a parent comment: delete all descendant comments recursively
      const descendantIds = await getAllDescendantIds(id);
      const totalReplyCount = descendantIds.length;

      await prisma.$transaction([
        // Delete all descendant comments
        prisma.comment.updateMany({
          where: { id: { in: descendantIds } },
          data: { isDeleted: true },
        }),
        // Delete direct child comments
        prisma.comment.updateMany({
          where: { parentId: id },
          data: { isDeleted: true },
        }),
        // Delete the parent comment itself
        prisma.comment.update({
          where: { id },
          data: { isDeleted: true },
        }),
        // Update post comment count
        prisma.post.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 + totalReplyCount } },
        }),
      ]);
    } else {
      // Deleting a reply: delete this comment and all its descendants
      const descendantIds = await getAllDescendantIds(id);
      const totalReplyCount = descendantIds.length;

      await prisma.$transaction([
        // Delete all descendant comments
        prisma.comment.updateMany({
          where: { id: { in: descendantIds } },
          data: { isDeleted: true },
        }),
        // Delete the comment itself
        prisma.comment.update({
          where: { id },
          data: { isDeleted: true },
        }),
        // Update post comment count
        prisma.post.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 + totalReplyCount } },
        }),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
