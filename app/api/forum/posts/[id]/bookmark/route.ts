import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { extractContentPreview, getActorDisplayName, sendPushToUser } from "@/src/services/expo-push.service";

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

    const existing = await prisma.bookmark.findUnique({
      where: { userId_postId: { userId: user.id, postId } },
    });

    if (existing) {
      await prisma.bookmark.delete({
        where: { userId_postId: { userId: user.id, postId } },
      });
      return NextResponse.json({
        success: true,
        data: { bookmarked: false },
      });
    }

    await prisma.bookmark.create({
      data: { userId: user.id, postId },
    });
    if (post.authorId !== user.id) {
      await sendPushToUser({
        userId: post.authorId,
        title: `${getActorDisplayName(user)} bookmarked your post`,
        body: extractContentPreview(post.content) || "Open BUHUB to view the post.",
        category: "likes",
        data: {
          type: "bookmark",
          postId,
          path: `post/${postId}`,
        },
      });
    }
    return NextResponse.json({
      success: true,
      data: { bookmarked: true },
    });
  } catch (error) {
    return handleError(error);
  }
}
