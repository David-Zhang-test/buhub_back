import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";
import { extractContentPreview, getActorDisplayName, sendPushOnce } from "@/src/services/expo-push.service";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";
import { createNotificationOnce, buildPushDedupeKey } from "@/src/lib/notification";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { allowed } = await checkCustomRateLimit(`rl:like:${user.id}`, 60_000, 60);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 }
      );
    }

    const { id: postId } = await params;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.like.findFirst({
        where: { userId: user.id, postId },
      });

      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: Math.max(0, updated.likeCount) };
      }

      await tx.like.create({ data: { userId: user.id, postId } });
      const updated = await tx.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: updated.likeCount };
    });

    if (result.liked && post.authorId !== user.id) {
      const created = await createNotificationOnce({
        userId: post.authorId,
        type: "like",
        actorId: user.id,
        postId,
      });
      if (created) {
        messageEventBroker.publish(post.authorId, {
          id: crypto.randomUUID(),
          type: "notification:new",
          notificationType: "like",
          createdAt: Date.now(),
        });
        const recipientLang = await getUserLanguage(post.authorId);
        await sendPushOnce({
          dedupeKey: buildPushDedupeKey("like", user.id, post.authorId, postId),
          userId: post.authorId,
          title: pushT(recipientLang, "like.post", { actor: getActorDisplayName(user) }),
          body: extractContentPreview(post.content) || pushT(recipientLang, "fallback.post"),
          category: "likes",
          data: {
            type: "like",
            postId,
            path: `post/${postId}`,
          },
        });
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error);
  }
}
