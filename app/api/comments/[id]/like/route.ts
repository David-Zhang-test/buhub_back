import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";
import { extractContentPreview, getActorDisplayName, sendPushOnce } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";
import { buildPushDedupeKey } from "@/src/lib/notification";
import { getBlockedUserIds } from "@/src/lib/blocks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });

    if (!comment || comment.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Comment not found" } },
        { status: 404 }
      );
    }

    // Refuse like when either side has blocked the other (uses comment author).
    const blockedSet = new Set(await getBlockedUserIds(user.id));
    if (blockedSet.has(comment.authorId)) {
      return NextResponse.json(
        { success: false, error: { code: "BLOCKED", message: "Cannot interact with this comment" } },
        { status: 403 }
      );
    }

    const existing = await prisma.like.findFirst({
      where: { userId: user.id, commentId },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      await prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      });
      return NextResponse.json({
        success: true,
        data: { liked: false, likeCount: Math.max(0, comment.likeCount - 1) },
      });
    }

    await prisma.like.create({
      data: { userId: user.id, commentId },
    });
    await prisma.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
    });

    if (comment.authorId !== user.id) {
      // At most one like notification per (recipient, actor, comment). Branch on prior state:
      //   - prior unread  → silent refresh (timestamp only, no badge bump, no push)
      //   - prior read    → delete + create fresh + notify
      //   - no prior      → create + notify
      const prior = await prisma.notification.findFirst({
        where: {
          userId: comment.authorId,
          type: "like",
          actorId: user.id,
          postId: comment.postId,
          commentId,
        },
        select: { id: true, isRead: true },
      });

      let isFreshUnread: boolean;
      if (prior && !prior.isRead) {
        await prisma.notification.update({
          where: { id: prior.id },
          data: { createdAt: new Date() },
        });
        isFreshUnread = false;
      } else {
        await prisma.$transaction([
          ...(prior ? [prisma.notification.delete({ where: { id: prior.id } })] : []),
          prisma.notification.create({
            data: {
              userId: comment.authorId,
              type: "like",
              actorId: user.id,
              postId: comment.postId,
              commentId,
            },
          }),
        ]);
        isFreshUnread = true;
      }

      if (isFreshUnread) {
        messageEventBroker.publish(comment.authorId, {
          id: crypto.randomUUID(),
          type: "notification:new",
          notificationType: "like",
          createdAt: Date.now(),
        });
        const recipientLang = await getUserLanguage(comment.authorId);
        const likeCommentAction = pushT(recipientLang, "like.comment", { actor: getActorDisplayName(user) });
        const likeCommentPreview = extractContentPreview(comment.content);
        await sendPushOnce({
          dedupeKey: buildPushDedupeKey("like-comment", user.id, comment.authorId, commentId),
          userId: comment.authorId,
          title: "ULinks",
          body: likeCommentPreview ? `${likeCommentAction}：${likeCommentPreview}` : likeCommentAction,
          category: "likes",
          suppressIfFocused: `post:${comment.postId}`,
          data: {
            type: "like",
            postId: comment.postId,
            commentId,
            path: `post/${comment.postId}`,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { liked: true, likeCount: comment.likeCount + 1 },
    });
  } catch (error) {
    return handleError(error);
  }
}
