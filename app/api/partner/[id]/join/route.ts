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
    const { id: postId } = await params;

    const post = await prisma.partnerPost.findUnique({
      where: { id: postId },
    });

    const now = new Date();
    const isExpiredByTime = !!post && post.expiresAt < now;
    if (isExpiredByTime && post && !post.expired) {
      await prisma.partnerPost.update({
        where: { id: postId },
        data: { expired: true },
      });
    }

    if (!post || post.expired || isExpiredByTime) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found or expired" } },
        { status: 404 }
      );
    }
    if (post.authorId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID", message: "Cannot join your own post" } },
        { status: 400 }
      );
    }

    const existing = await prisma.partnerJoin.findUnique({
      where: { postId_userId: { postId, userId: user.id } },
    });

    if (existing) {
      await prisma.partnerJoin.delete({
        where: { postId_userId: { postId, userId: user.id } },
      });
      return NextResponse.json({ success: true, data: { joined: false } });
    }

    await prisma.partnerJoin.create({
      data: { postId, userId: user.id },
    });
    return NextResponse.json({ success: true, data: { joined: true } });
  } catch (error) {
    return handleError(error);
  }
}
