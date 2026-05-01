import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { extractContentPreview, getActorDisplayName, sendPushToUser } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";

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
    if (comment.authorId !== user.id) {
      const recipientLang = await getUserLanguage(comment.authorId);
      await sendPushToUser({
        userId: comment.authorId,
        title: pushT(recipientLang, "bookmark.comment", { actor: getActorDisplayName(user) }),
        body: extractContentPreview(comment.content) || pushT(recipientLang, "fallback.comment"),
        category: "likes",
        suppressIfFocused: `post:${comment.postId}`,
        data: {
          type: "bookmark",
          postId: comment.postId,
          commentId,
          path: `post/${comment.postId}`,
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
