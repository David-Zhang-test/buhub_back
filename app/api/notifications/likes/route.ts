import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getBlockedUserIds } from "@/src/lib/blocks";
import { resolveNotificationListPaging } from "@/src/lib/notification-pagination";

const FUNCTION_REF_PREFIX = "[FUNC_REF]";
const MAX_POST_TITLE_LENGTH = 60;
const MAX_COMMENT_PREVIEW_LENGTH = 50;

function truncateText(text: string, maxLength: number): string {
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

    const { searchParams } = new URL(req.url);
    const { skip, limit } = resolveNotificationListPaging(searchParams);

    const blockedUserIds = await getBlockedUserIds(user.id);
    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: "like",
        ...(blockedUserIds.length > 0 ? { actorId: { notIn: blockedUserIds } } : {}),
      },
      include: {
        actor: {
          select: {
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const postIds = notifications.map((n) => n.postId).filter(Boolean) as string[];
    const posts = postIds.length
      ? await prisma.post.findMany({
          where: { id: { in: postIds }, isDeleted: false },
          select: { id: true, content: true },
        })
      : [];
    const postMap = new Map(posts.map((p) => [p.id, p.content]));

    const commentIds = notifications.map((n) => n.commentId).filter(Boolean) as string[];
    const comments = commentIds.length
      ? await prisma.comment.findMany({
          where: { id: { in: commentIds }, isDeleted: false, post: { isDeleted: false } },
          select: { id: true, content: true, parentId: true, postId: true },
        })
      : [];
    const commentMap = new Map(comments.map((c) => [c.id, c]));

    const invalidNotificationIds = notifications
      .filter((n) => {
        if (n.commentId) return !commentMap.has(n.commentId);
        if (n.postId) return !postMap.has(n.postId);
        return true;
      })
      .map((n) => n.id);

    if (invalidNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          id: { in: invalidNotificationIds },
          userId: user.id,
          type: "like",
        },
      });
    }

    const invalidIdSet = new Set(invalidNotificationIds);
    const validNotifications = notifications.filter((n) => !invalidIdSet.has(n.id));

    const data = validNotifications.map((n) => {
      const comment = n.commentId ? commentMap.get(n.commentId) : undefined;
      const action = n.commentId
        ? (comment?.parentId ? "likedYourReply" : "likedYourComment")
        : "likedYourPost";
      const sourceContent = n.commentId
        ? truncateText(comment?.content ?? "", MAX_COMMENT_PREVIEW_LENGTH)
        : extractPostTitle((n.postId && postMap.get(n.postId)) ?? "");

      return {
        id: n.id,
        user: n.actor?.nickname ?? "",
        userName: n.actor?.userName ?? n.actor?.nickname ?? "",
        avatar: n.actor?.avatar ?? "",
        gender: n.actor?.gender ?? "other",
        grade: n.actor?.grade ?? null,
        major: n.actor?.major ?? null,
        action,
        content: sourceContent,
        time: n.createdAt.toISOString(),
        postId: n.postId ?? comment?.postId ?? "",
        commentId: n.commentId ?? undefined,
        isRead: n.isRead,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
