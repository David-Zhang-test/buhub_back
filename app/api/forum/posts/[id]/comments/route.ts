import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createCommentSchema } from "@/src/schemas/comment.schema";
import {
  generateDeterministicAnonymousIdentity,
  resolveAnonymousIdentity,
} from "@/src/lib/anonymous";
import { messageEventBroker } from "@/src/lib/message-events";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage, type AppLanguage } from "@/src/lib/language";
import { moderateText } from "@/src/lib/content-moderation";
import { extractContentPreview, getActorDisplayName, sendPushOnce } from "@/src/services/expo-push.service";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";
import { createNotificationOnce, buildPushDedupeKey } from "@/src/lib/notification";
import { getBlockedUserIds } from "@/src/lib/blocks";

const MENTION_REGEX = /(^|[^\p{L}\p{N}_.\-@\uFF20])[@\uFF20]([\p{L}\p{N}_.\-]{2,30})/gu;

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

type SerializedCommentRecord = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  updatedAt?: string;
  likeCount: number;
  isAnonymous: boolean;
  anonymousName: string | null;
  anonymousAvatar: string | null;
  authorId: string | null;
  author: unknown;
  name: string;
  avatar: string | null;
  gender: string | null | undefined;
  userName: string | null | undefined;
  sourceLanguage: string;
  isOwnedByCurrentUser: boolean;
  liked: boolean;
  bookmarked: boolean;
  replies: SerializedCommentRecord[];
};

function serializeCommentRecord<
  T extends {
    id: string;
    postId: string;
    parentId?: string | null;
    content: string;
    createdAt: Date;
    updatedAt?: Date;
    likeCount: number;
    isAnonymous: boolean;
    anonymousName?: string | null;
    anonymousAvatar?: string | null;
    author?: unknown;
    authorId?: string | null;
  },
>(input: {
  comment: T;
  presentation: ReturnType<typeof buildCommentPresentation>;
  isOwnedByCurrentUser: boolean;
  liked: boolean;
  bookmarked: boolean;
  replies?: SerializedCommentRecord[];
}): SerializedCommentRecord {
  const { comment, presentation, isOwnedByCurrentUser, liked, bookmarked, replies } = input;

  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId ?? null,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt?.toISOString(),
    likeCount: comment.likeCount,
    isAnonymous: comment.isAnonymous,
    anonymousName: comment.anonymousName ?? null,
    anonymousAvatar: comment.anonymousAvatar ?? null,
    authorId: comment.isAnonymous ? null : (comment.authorId ?? null),
    author: comment.isAnonymous ? null : (comment.author ?? null),
    name: presentation.name,
    avatar: presentation.avatar,
    gender: presentation.gender,
    userName: presentation.userName,
    sourceLanguage: presentation.sourceLanguage,
    isOwnedByCurrentUser,
    liked,
    bookmarked,
    replies: replies ?? [],
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

    // Hide comments authored by blocked users — symmetric, but ONLY for
    // identified comments. Anonymous comments stay visible regardless of
    // block, since the host cannot identify the blocked user from anon
    // content anyway and filtering would expose information the host
    // wouldn't otherwise know.
    const blockedUserIds = currentUserId ? await getBlockedUserIds(currentUserId) : [];
    const authorBlockClause = blockedUserIds.length > 0
      ? { NOT: { authorId: { in: blockedUserIds }, isAnonymous: false } }
      : {};

    // 1. Paginate top-level comments at the DB level
    const paginatedTopLevel: any[] = await prisma.comment.findMany({
      where: { postId, isDeleted: false, parentId: null, ...authorBlockClause },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
    } as any);

    // 2. Fetch replies only for the paginated top-level comments
    const topLevelIds = paginatedTopLevel.map((c) => c.id);
    let replies: any[] = [];
    if (topLevelIds.length > 0) {
      // Fetch all descendants by walking parentId chains (max 3 levels deep)
      let parentIds = topLevelIds;
      const allReplyIds: string[] = [];
      for (let depth = 0; depth < 3 && parentIds.length > 0; depth++) {
        const batch: any[] = await prisma.comment.findMany({
          where: { postId, isDeleted: false, parentId: { in: parentIds }, ...authorBlockClause },
          include: { author: { select: AUTHOR_SELECT } },
          orderBy: { createdAt: "asc" },
        } as any);
        replies.push(...batch);
        parentIds = batch.map((r) => r.id);
        allReplyIds.push(...parentIds);
      }
    }

    // 3. Batch-check liked/bookmarked for visible comments only
    const allVisibleIds = [...topLevelIds, ...replies.map((r) => r.id)];
    let likedCommentIds = new Set<string>();
    let bookmarkedCommentIds = new Set<string>();
    if (currentUserId && allVisibleIds.length > 0) {
      const [userLikes, userBookmarks] = await Promise.all([
        prisma.like.findMany({
          where: { userId: currentUserId, commentId: { in: allVisibleIds } },
          select: { commentId: true },
        }),
        prisma.commentBookmark.findMany({
          where: { userId: currentUserId, commentId: { in: allVisibleIds } },
          select: { commentId: true },
        }),
      ]);
      likedCommentIds = new Set(userLikes.map((like) => like.commentId).filter(Boolean) as string[]);
      bookmarkedCommentIds = new Set(userBookmarks.map((bookmark) => bookmark.commentId));
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
        return serializeCommentRecord({
          comment: reply,
          presentation,
          isOwnedByCurrentUser: Boolean(currentUserId && reply.authorId === currentUserId),
          liked: likedCommentIds.has(reply.id),
          bookmarked: bookmarkedCommentIds.has(reply.id),
          replies: buildNestedReplies(reply.id),
        }) as NestedReply;
      });
    }

    const nested = paginatedTopLevel.map((comment) => {
      const presentation = buildCommentPresentation(comment, appLanguage);
      return serializeCommentRecord({
        comment,
        presentation,
        isOwnedByCurrentUser: Boolean(currentUserId && comment.authorId === currentUserId),
        liked: likedCommentIds.has(comment.id),
        bookmarked: bookmarkedCommentIds.has(comment.id),
        replies: buildNestedReplies(comment.id),
      });
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
    await assertHasVerifiedHkbuEmail(user);
    const { allowed } = await checkCustomRateLimit(`rl:comment:${user.id}`, 60_000, 15);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many comments, please slow down" } },
        { status: 429 }
      );
    }

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

    // Refuse comment when either side has blocked the other (matches the
    // GET filter so blocked users cannot inject content the host won't see).
    const blockedSet = new Set(await getBlockedUserIds(user.id));
    if (blockedSet.has(post.authorId)) {
      return NextResponse.json(
        { success: false, error: { code: "BLOCKED", message: "Cannot comment on this post" } },
        { status: 403 }
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
      anonymousIdentity = generateDeterministicAnonymousIdentity(user.id, appLanguage);
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

    if (notifyUserId !== user.id) {
      const created = await createNotificationOnce({
        userId: notifyUserId,
        type: "comment",
        actorId: user.id,
        postId,
        commentId: comment.id,
      });
      if (created) {
        messageEventBroker.publish(notifyUserId, {
          id: crypto.randomUUID(),
          type: "notification:new",
          notificationType: "comment",
          createdAt: Date.now(),
        });
        const recipientLang = await getUserLanguage(notifyUserId);
        const commentActionText = data.parentId
          ? pushT(recipientLang, "reply.comment", { actor: getActorDisplayName(user) })
          : pushT(recipientLang, "comment.post", { actor: getActorDisplayName(user) });
        const commentPreview = extractContentPreview(data.content);
        await sendPushOnce({
          dedupeKey: buildPushDedupeKey("comment", user.id, notifyUserId, comment.id),
          userId: notifyUserId,
          title: "ULink",
          body: commentPreview ? `${commentActionText}：${commentPreview}` : commentActionText,
          category: "comments",
          data: {
            type: data.parentId ? "reply" : "comment",
            postId,
            commentId: comment.id,
            path: `post/${postId}`,
          },
        });
      }
    }

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
        await Promise.allSettled(
          mentionUserIds.map(async (mentionedUserId) => {
            const created = await createNotificationOnce({
              userId: mentionedUserId,
              type: "mention",
              actorId: user.id,
              postId,
              commentId: comment.id,
            });
            if (!created) return;
            messageEventBroker.publish(mentionedUserId, {
              id: crypto.randomUUID(),
              type: "notification:new",
              notificationType: "comment",
              createdAt: Date.now(),
            });
            const mentionLang = await getUserLanguage(mentionedUserId);
            const mentionActionText = pushT(mentionLang, "mention.comment", { actor: getActorDisplayName(user) });
            const mentionPreview = extractContentPreview(data.content);
            await sendPushOnce({
              dedupeKey: buildPushDedupeKey("mention", user.id, mentionedUserId, comment.id),
              userId: mentionedUserId,
              title: "ULink",
              body: mentionPreview ? `${mentionActionText}：${mentionPreview}` : mentionActionText,
              category: "comments",
              data: {
                type: "mention",
                postId,
                commentId: comment.id,
                path: `post/${postId}`,
              },
            });
          })
        );
      }
    }

    const presentation = buildCommentPresentation(comment, appLanguage);
    return NextResponse.json({
      success: true,
      data: serializeCommentRecord({
        comment,
        presentation,
        isOwnedByCurrentUser: true,
        liked: false,
        bookmarked: false,
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
