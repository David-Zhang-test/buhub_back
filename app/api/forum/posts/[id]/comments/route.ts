import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createCommentSchema } from "@/src/schemas/comment.schema";
import {
  generateDistinctAnonymousIdentity,
  resolveAnonymousIdentity,
} from "@/src/lib/anonymous";
import { messageEventBroker } from "@/src/lib/message-events";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage, type AppLanguage } from "@/src/lib/language";
import { moderateText } from "@/src/lib/content-moderation";

const MENTION_REGEX = /(^|[^A-Za-z0-9_@\uFF20])[@\uFF20]([A-Za-z0-9_]{2,30})/g;

function extractMentionHandles(content: string): string[] {
  if (!content) return [];
  const dedupedByLower = new Map<string, string>();
  MENTION_REGEX.lastIndex = 0;
  let match = MENTION_REGEX.exec(content);
  while (match) {
    const raw = match[2]?.trim();
    if (raw) {
      const normalized = raw.toLowerCase();
      if (!dedupedByLower.has(normalized)) {
        dedupedByLower.set(normalized, raw);
      }
    }
    match = MENTION_REGEX.exec(content);
  }
  return Array.from(dedupedByLower.values());
}

const AUTHOR_SELECT = {
  id: true,
  nickname: true,
  avatar: true,
  gender: true,
  grade: true,
  major: true,
  userName: true,
} as const;

function buildCommentPresentation<
  T extends {
    id: string;
    authorId: string;
    isAnonymous: boolean;
    anonymousName?: string | null;
    anonymousAvatar?: string | null;
    sourceLanguage: string;
    likes?: unknown[];
    author?: {
      nickname?: string | null;
      avatar?: string | null;
      gender?: string | null;
      grade?: string | null;
      major?: string | null;
      userName?: string | null;
    } | null;
  },
>(comment: T, language: AppLanguage) {
  const anonymousIdentity = comment.isAnonymous
    ? resolveAnonymousIdentity(
        {
          anonymousName: comment.anonymousName,
          anonymousAvatar: comment.anonymousAvatar,
          authorId: comment.authorId,
        },
        language
      )
    : null;

  return {
    name: comment.isAnonymous ? (anonymousIdentity?.name ?? "Anonymous Guest") : (comment.author?.nickname ?? "?"),
    avatar: comment.isAnonymous ? (anonymousIdentity?.avatar ?? null) : (comment.author?.avatar ?? null),
    gender: comment.isAnonymous ? "other" : comment.author?.gender,
    grade: comment.isAnonymous ? null : comment.author?.grade,
    major: comment.isAnonymous ? null : comment.author?.major,
    userName: comment.isAnonymous ? null : comment.author?.userName,
    sourceLanguage: comment.sourceLanguage,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const appLanguage = resolveRequestLanguage(req.headers);
    const { id: postId } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      currentUserId = null;
    }

    const allComments: any[] = await prisma.comment.findMany({
      where: { postId, isDeleted: false },
      include: {
        author: { select: AUTHOR_SELECT },
        likes: true,
      },
      orderBy: { createdAt: "asc" },
    } as any);

    const topLevel = allComments.filter((comment) => comment.parentId === null);
    const replies = allComments.filter((comment) => comment.parentId !== null);
    const paginatedTopLevel = topLevel.slice(skip, skip + limit);

    let likedCommentIds = new Set<string>();
    let bookmarkedCommentIds = new Set<string>();
    if (currentUserId) {
      const allCommentIds = [...topLevel.map((comment) => comment.id), ...replies.map((reply) => reply.id)];
      if (allCommentIds.length > 0) {
        const [userLikes, userBookmarks] = await Promise.all([
          prisma.like.findMany({
            where: { userId: currentUserId, commentId: { in: allCommentIds } },
            select: { commentId: true },
          }),
          prisma.commentBookmark.findMany({
            where: { userId: currentUserId, commentId: { in: allCommentIds } },
            select: { commentId: true },
          }),
        ]);
        likedCommentIds = new Set(userLikes.map((like) => like.commentId).filter(Boolean) as string[]);
        bookmarkedCommentIds = new Set(userBookmarks.map((bookmark) => bookmark.commentId));
      }
    }

    const replyMap = new Map<string, typeof replies>();
    for (const reply of replies) {
      if (!reply.parentId) continue;
      const list = replyMap.get(reply.parentId) ?? [];
      list.push(reply);
      replyMap.set(reply.parentId, list);
    }

    type ReplyWithRelations = (typeof replies)[number];
    type NestedReply = ReplyWithRelations & {
      name: string | undefined;
      avatar: string | null | undefined;
      gender: string | null | undefined;
      userName: string | null | undefined;
      sourceLanguage: string;
      liked: boolean;
      bookmarked: boolean;
      replies: NestedReply[];
    };

    function buildNestedReplies(parentId: string): NestedReply[] {
      const childReplies = replyMap.get(parentId) ?? [];
      return childReplies.map((reply) => {
        const presentation = buildCommentPresentation(reply, appLanguage);
        return {
          ...reply,
          name: presentation.name,
          avatar: presentation.avatar,
          gender: presentation.gender,
          userName: presentation.userName,
          sourceLanguage: presentation.sourceLanguage,
          liked: likedCommentIds.has(reply.id),
          bookmarked: bookmarkedCommentIds.has(reply.id),
          replies: buildNestedReplies(reply.id),
        };
      });
    }

    const nested = paginatedTopLevel.map((comment) => {
      const presentation = buildCommentPresentation(comment, appLanguage);
      return {
        ...comment,
        name: presentation.name,
        avatar: presentation.avatar,
        gender: presentation.gender,
        userName: presentation.userName,
        sourceLanguage: presentation.sourceLanguage,
        liked: likedCommentIds.has(comment.id),
        bookmarked: bookmarkedCommentIds.has(comment.id),
        replies: buildNestedReplies(comment.id),
      };
    });

    return NextResponse.json({
      success: true,
      data: nested,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const appLanguage = resolveRequestLanguage(req.headers, resolveAppLanguage(user.language));
    const { id: postId } = await params;
    const body = await req.json();
    const data = createCommentSchema.parse({ ...body, postId });
    const mentionHandles = extractMentionHandles(data.content);

    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    if (data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: data.parentId, postId },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Parent comment not found" } },
          { status: 400 }
        );
      }
    }

    const moderation = await moderateText(data.content);
    if (moderation.flagged) {
      return NextResponse.json(
        { success: false, error: { code: "CONTENT_VIOLATION", message: "Your comment contains content that violates community guidelines", categories: moderation.categories } },
        { status: 400 }
      );
    }

    let anonymousIdentity = null;
    if (data.isAnonymous) {
      const [latestAnonymousPost, latestAnonymousComment] = await Promise.all([
        prisma.post.findFirst({
          where: { authorId: user.id, isAnonymous: true },
          select: { anonymousName: true, anonymousAvatar: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.comment.findFirst({
          where: { authorId: user.id, isAnonymous: true },
          select: { anonymousName: true, anonymousAvatar: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const previousAnonymousIdentity =
        latestAnonymousPost && latestAnonymousComment
          ? latestAnonymousPost.createdAt >= latestAnonymousComment.createdAt
            ? latestAnonymousPost
            : latestAnonymousComment
          : latestAnonymousPost ?? latestAnonymousComment;

      anonymousIdentity = generateDistinctAnonymousIdentity(appLanguage, previousAnonymousIdentity);
    }
    const comment: any = await prisma.comment.create({
      data: {
        postId,
        authorId: user.id,
        sourceLanguage: detectContentLanguage([data.content], resolveAppLanguage(user.language)),
        content: data.content,
        parentId: data.parentId,
        isAnonymous: data.isAnonymous ?? false,
        anonymousName: anonymousIdentity?.serializedName,
        anonymousAvatar: anonymousIdentity?.avatar,
      },
      include: {
        author: { select: AUTHOR_SELECT },
      },
    } as any);

    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    const notifyUserId = data.parentId
      ? (await prisma.comment.findUnique({
          where: { id: data.parentId },
          select: { authorId: true },
        }))?.authorId ?? post.authorId
      : post.authorId;

    await prisma.notification.create({
      data: {
        userId: notifyUserId,
        type: "comment",
        actorId: user.id,
        postId,
        commentId: comment.id,
      },
    });
    messageEventBroker.publish(notifyUserId, {
      id: crypto.randomUUID(),
      type: "notification:new",
      notificationType: "comment",
      createdAt: Date.now(),
    });

    if (mentionHandles.length > 0) {
      const mentionLookupConditions = mentionHandles.flatMap((handle) => [
        { userName: { equals: handle, mode: "insensitive" as const } },
        { nickname: { equals: handle, mode: "insensitive" as const } },
      ]);
      const mentionedUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          isBanned: false,
          OR: mentionLookupConditions,
        },
        select: { id: true },
      });
      const mentionUserIds = Array.from(
        new Set(
          mentionedUsers
            .map((mentionedUser) => mentionedUser.id)
            .filter((id) => id !== user.id && id !== notifyUserId)
        )
      );

      if (mentionUserIds.length > 0) {
        await prisma.notification.createMany({
          data: mentionUserIds.map((mentionedUserId) => ({
            userId: mentionedUserId,
            type: "mention",
            actorId: user.id,
            postId,
            commentId: comment.id,
          })),
        });
        mentionUserIds.forEach((mentionedUserId) => {
          messageEventBroker.publish(mentionedUserId, {
            id: crypto.randomUUID(),
            type: "notification:new",
            notificationType: "comment",
            createdAt: Date.now(),
          });
        });
      }
    }

    const presentation = buildCommentPresentation(comment, appLanguage);
    return NextResponse.json({
      success: true,
      data: {
        ...comment,
        name: presentation.name,
        avatar: presentation.avatar,
        gender: presentation.gender,
        userName: presentation.userName,
        sourceLanguage: presentation.sourceLanguage,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
