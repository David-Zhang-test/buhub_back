import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: postId } = await params;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    const existing = await prisma.like.findFirst({
      where: { userId: user.id, postId },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      await prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
      return NextResponse.json({
        success: true,
        data: { liked: false, likeCount: Math.max(0, post.likeCount - 1) },
      });
    }

    await prisma.like.create({
      data: { userId: user.id, postId },
    });
    await prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    });

    await prisma.notification.create({
      data: {
        userId: post.authorId,
        type: "like",
        actorId: user.id,
        postId,
      },
    });
    messageEventBroker.publish(post.authorId, {
      id: crypto.randomUUID(),
      type: "notification:new",
      notificationType: "like",
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      data: { liked: true, likeCount: post.likeCount + 1 },
    });
  } catch (error) {
    return handleError(error);
  }
}
