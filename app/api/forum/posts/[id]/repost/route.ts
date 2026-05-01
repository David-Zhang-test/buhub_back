import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveAppLanguage, resolveRequestLanguage } from "@/src/lib/language";
import { z } from "zod";
import { createNotificationOnce, buildPushDedupeKey } from "@/src/lib/notification";
import { getBlockedUserIds } from "@/src/lib/blocks";
import { messageEventBroker } from "@/src/lib/message-events";
import {
  extractContentPreview,
  getActorDisplayName,
  sendPushOnce,
} from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";

const repostSchema = z.object({
  comment: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);
    const appLanguage = resolveRequestLanguage(req.headers, resolveAppLanguage(user.language));
    const { id: originalPostId } = await params;
    const body = await req.json().catch(() => ({}));
    const { comment } = repostSchema.parse(body);

    const originalPost = await prisma.post.findUnique({
      where: { id: originalPostId },
      include: { author: true },
    });

    if (!originalPost || originalPost.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "POST_NOT_FOUND", message: "Original post not found" } },
        { status: 404 }
      );
    }

    if (!originalPost.category || originalPost.category === "forum") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REPOST", message: "Can only repost from additional features" } },
        { status: 400 }
      );
    }

    // Refuse repost when either side has blocked the other.
    const blockedSet = new Set(await getBlockedUserIds(user.id));
    if (blockedSet.has(originalPost.authorId)) {
      return NextResponse.json(
        { success: false, error: { code: "BLOCKED", message: "Cannot repost this user's post" } },
        { status: 403 }
      );
    }

    const existingRepost = await prisma.post.findFirst({
      where: {
        authorId: user.id,
        originalPostId,
        isRepost: true,
      },
    });

    if (existingRepost) {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_REPOSTED", message: "You have already reposted this" } },
        { status: 400 }
      );
    }

    const originalAuthorLabel = originalPost.isAnonymous
      ? resolveAnonymousIdentity(
          {
            anonymousName: originalPost.anonymousName,
            anonymousAvatar: originalPost.anonymousAvatar,
            authorId: originalPost.authorId,
          },
          appLanguage
        ).name
      : (originalPost.author.nickname ?? originalPost.author.userName ?? "Unknown");

    const repostContent = comment
      ? `${comment}\n\n[Reposted from @${originalAuthorLabel}]\n${originalPost.content}`
      : `[Reposted from @${originalAuthorLabel}]\n${originalPost.content}`;

    const repost = await prisma.post.create({
      data: {
        authorId: user.id,
        postType: originalPost.postType,
        content: repostContent,
        images: originalPost.images,
        tags: originalPost.tags,
        category: "forum",
        isRepost: true,
        originalPostId,
      },
    });

    if (originalPost.authorId !== user.id) {
      const created = await createNotificationOnce({
        userId: originalPost.authorId,
        type: "repost",
        actorId: user.id,
        postId: repost.id,
      });
      if (created) {
        messageEventBroker.publish(originalPost.authorId, {
          id: crypto.randomUUID(),
          type: "notification:new",
          notificationType: "comment",
          createdAt: Date.now(),
        });
        const recipientLang = await getUserLanguage(originalPost.authorId);
        const actionText = pushT(recipientLang, "repost", { actor: getActorDisplayName(user) });
        const preview = extractContentPreview(originalPost.content);
        await sendPushOnce({
          dedupeKey: buildPushDedupeKey("repost", user.id, originalPost.authorId, repost.id),
          userId: originalPost.authorId,
          title: "ULink",
          body: preview ? `${actionText}：${preview}` : actionText,
          category: "comments",
          suppressIfFocused: `post:${originalPost.id}`,
          data: {
            type: "repost",
            postId: repost.id,
            path: `post/${repost.id}`,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { postId: repost.id },
    });
  } catch (error) {
    return handleError(error, req);
  }
}
