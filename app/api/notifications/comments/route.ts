import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveRequestLanguage, resolveAppLanguage } from "@/src/lib/language";
import { getBlockedUserIds } from "@/src/lib/blocks";

const FUNCTION_REF_PREFIX = "[FUNC_REF]";
const MAX_POST_TITLE_LENGTH = 60;
const MAX_COMMENT_PREVIEW_LENGTH = 80;

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function extractPostTitle(rawContent: string): string {
  if (!rawContent) return "";

  if (rawContent.startsWith(FUNCTION_REF_PREFIX)) {
    const newlineIndex = rawContent.indexOf("\n");
    if (newlineIndex > FUNCTION_REF_PREFIX.length) {
      const rawPayload = rawContent.slice(FUNCTION_REF_PREFIX.length, newlineIndex);
      try {
        const payload = JSON.parse(rawPayload) as { title?: string };
        const funcTitle = payload?.title?.trim();
        if (funcTitle) return truncateText(funcTitle, MAX_POST_TITLE_LENGTH);
      } catch {
        // ignore parse failure and fall back to plain content title
      }
    }
    const plainContent = newlineIndex >= 0 ? rawContent.slice(newlineIndex + 1) : rawContent;
    const firstLine = plainContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine ? truncateText(firstLine, MAX_POST_TITLE_LENGTH) : "";
  }

  const firstLine = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? truncateText(firstLine, MAX_POST_TITLE_LENGTH) : "";
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const appLanguage = resolveRequestLanguage(req.headers, resolveAppLanguage(user.language));

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20") || 20, 1), 50);
    const skip = (page - 1) * limit;

    const blockedUserIds = await getBlockedUserIds(user.id);
    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: { in: ["comment", "mention"] },
        ...(blockedUserIds.length > 0 ? { actorId: { notIn: blockedUserIds } } : {}),
      },
      include: {
        actor: {
          select: {
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const postIds = notifications.map((n) => n.postId).filter(Boolean) as string[];
    const commentIds = notifications.map((n) => n.commentId).filter(Boolean) as string[];

    const [posts, comments] = await Promise.all([
      postIds.length
        ? prisma.post.findMany({
            where: { id: { in: postIds }, isDeleted: false },
            select: { id: true, content: true },
          })
        : [],
      commentIds.length
        ? prisma.comment.findMany({
            where: { id: { in: commentIds }, isDeleted: false, post: { isDeleted: false } },
            select: {
              id: true,
              content: true,
              parentId: true,
              postId: true,
              isAnonymous: true,
              anonymousName: true,
              anonymousAvatar: true,
            },
          })
        : [],
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const commentMap = new Map(comments.map((c) => [c.id, c]));

    const invalidNotificationIds = notifications
      .filter((n) => {
        if (!n.postId || !n.commentId) return true;
        const post = postMap.get(n.postId);
        const comment = commentMap.get(n.commentId);
        if (!comment || !post) return true;
        if (!comment.isAnonymous && (!n.actor || (!n.actor.userName && !n.actor.nickname))) return true;
        return !post || !comment;
      })
      .map((n) => n.id);

    if (invalidNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          id: { in: invalidNotificationIds },
          userId: user.id,
          type: { in: ["comment", "mention"] },
        },
      });
    }

    const invalidIdSet = new Set(invalidNotificationIds);
    const data = notifications
      .filter((n) => !invalidIdSet.has(n.id))
      .map((n) => {
        const post = n.postId ? postMap.get(n.postId) : undefined;
        const comment = n.commentId ? commentMap.get(n.commentId) : undefined;
        const isMention = n.type === "mention";
        const isReply = Boolean(comment?.parentId);
        const anonymousIdentity =
          comment?.isAnonymous
            ? resolveAnonymousIdentity(
                {
                  anonymousName: comment.anonymousName,
                  anonymousAvatar: comment.anonymousAvatar,
                },
                appLanguage
              )
            : null;
        return {
          id: n.id,
          user: anonymousIdentity?.name || n.actor?.nickname || n.actor?.userName || "",
          userName: comment?.isAnonymous ? "" : (n.actor?.userName ?? n.actor?.nickname ?? ""),
          avatar: anonymousIdentity?.avatar ?? n.actor?.avatar ?? "",
          gender: comment?.isAnonymous ? "secret" : (n.actor?.gender ?? "other"),
          isAnonymous: Boolean(comment?.isAnonymous),
          action: isMention ? "mentionedYou" : isReply ? "repliedYourComment" : "commentedYourPost",
          type: isMention ? "mention" : isReply ? "reply" : "comment",
          originalPost: extractPostTitle(post?.content ?? ""),
          comment: truncateText(comment?.content ?? "", MAX_COMMENT_PREVIEW_LENGTH),
          postId: comment?.postId ?? n.postId ?? "",
          commentId: n.commentId ?? "",
          time: n.createdAt.toISOString(),
          isRead: n.isRead,
        };
      });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
