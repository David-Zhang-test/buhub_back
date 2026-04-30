import { NextRequest, NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";
import { createPostSchema } from "@/src/schemas/post.schema";
import {
  generateDeterministicAnonymousIdentity,
  resolveAnonymousIdentity,
} from "@/src/lib/anonymous";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage } from "@/src/lib/language";
import { moderateText } from "@/src/lib/content-moderation";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { parseFunctionRef, resolveFunctionRefPreviews } from "@/src/lib/function-ref";
import { broadcastNewPostPush } from "@/src/services/new-post-push.service";
import { messageEventBroker } from "@/src/lib/message-events";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await checkCustomRateLimit(`rl:forum:list:${clientIp}`, 60_000, 60);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 }
      );
    }

    const appLanguage = resolveRequestLanguage(req.headers);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const sortBy = searchParams.get("sortBy") || "recent";
    const category = searchParams.get("category") || undefined;
    const skip = (page - 1) * limit;

    let blockedUserIds: string[] = [];
    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
      const cacheKey = `user:${user.id}:blocked`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        try {
          blockedUserIds = JSON.parse(cached);
        } catch {
          blockedUserIds = [];
        }
      }
      if (blockedUserIds.length === 0) {
        const blocked = await prisma.block.findMany({
          where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
          select: { blockedId: true, blockerId: true },
        });
        blockedUserIds = [
          ...blocked.filter((b) => b.blockerId === user.id).map((b) => b.blockedId),
          ...blocked.filter((b) => b.blockedId === user.id).map((b) => b.blockerId),
        ];
        await redis.setex(cacheKey, 300, JSON.stringify(blockedUserIds));
      }
    } catch {
      currentUserId = null;
      blockedUserIds = [];
    }

    const where: { isDeleted: boolean; NOT?: object; category?: string } = {
      isDeleted: false,
    };
    if (blockedUserIds.length > 0) {
      // Hide identified posts from blocked authors. Keep anonymous posts
      // visible since the host can't tell who wrote them anyway.
      where.NOT = { authorId: { in: blockedUserIds }, isAnonymous: false };
    }
    if (category) where.category = category;

    const posts: any[] = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
        pollOptions: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        originalPost: {
          select: {
            id: true,
            sourceLanguage: true,
            content: true,
            anonymousName: true,
            anonymousAvatar: true,
            author: {
              select: {
                id: true,
                nickname: true,
                avatar: true,
                gender: true,
                grade: true,
                major: true,
              },
            },
            createdAt: true,
            isAnonymous: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy:
        sortBy === "popular"
          ? [{ likeCount: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
    } as any);

    let likedPostIds = new Set<string>();
    let bookmarkedPostIds = new Set<string>();
    const userVotesByPost = new Map<string, { id: string; optionId: string; createdAt: Date }>();
    if (currentUserId && posts.length > 0) {
      const postIds = posts.map((p) => p.id);
      const pollPostIds = posts.filter((p) => p.postType === "poll").map((p) => p.id);
      const [likes, bookmarks, votes] = await Promise.all([
        prisma.like.findMany({
          where: { userId: currentUserId, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.bookmark.findMany({
          where: { userId: currentUserId, postId: { in: postIds } },
          select: { postId: true },
        }),
        pollPostIds.length > 0
          ? prisma.vote.findMany({
              where: { postId: { in: pollPostIds }, userId: currentUserId },
              select: { id: true, postId: true, optionId: true, createdAt: true },
            })
          : Promise.resolve([]),
      ]);
      likedPostIds = new Set(likes.map((l) => l.postId).filter(Boolean) as string[]);
      bookmarkedPostIds = new Set(bookmarks.map((b) => b.postId).filter(Boolean) as string[]);
      for (const vote of votes) {
        userVotesByPost.set(vote.postId, {
          id: vote.id,
          optionId: vote.optionId,
          createdAt: vote.createdAt,
        });
      }
    }

    const parsedRefsByPostId = new Map(
      posts.map((post) => [post.id, parseFunctionRef(post.content).ref]),
    );
    const previewsByEntity = await resolveFunctionRefPreviews(
      Array.from(parsedRefsByPostId.values()).filter((ref): ref is NonNullable<typeof ref> => Boolean(ref)),
    );

    const hydrated = posts.map((post) => {
      const ref = parsedRefsByPostId.get(post.id);
      const vote = post.postType === "poll" ? userVotesByPost.get(post.id) : undefined;
      const anonIdentity = post.isAnonymous
        ? resolveAnonymousIdentity(
            {
              anonymousName: post.anonymousName,
              anonymousAvatar: post.anonymousAvatar,
              authorId: post.authorId,
            },
            appLanguage
          )
        : null;

      let quotedPost = null;
      if (post.originalPost) {
        // Strip embedded quoted post when its author is blocked AND the
        // original is identified. Anonymous originals stay visible — the
        // host cannot identify the author from anon content anyway, and
        // hiding them would leak block-set info via the wrapper repost.
        const quotedAuthorBlocked =
          !post.originalPost.isAnonymous &&
          blockedUserIds.includes(post.originalPost.author.id);
        if (!quotedAuthorBlocked) {
          const quotedAnonIdentity = post.originalPost.isAnonymous
            ? resolveAnonymousIdentity(
                {
                  anonymousName: post.originalPost.anonymousName,
                  anonymousAvatar: post.originalPost.anonymousAvatar,
                  authorId: post.originalPost.author.id,
                },
                appLanguage
              )
            : null;

          quotedPost = {
            id: post.originalPost.id,
            sourceLanguage: post.originalPost.sourceLanguage,
            content: post.originalPost.content,
            name: post.originalPost.isAnonymous ? quotedAnonIdentity?.name : post.originalPost.author?.nickname,
            avatar: post.originalPost.isAnonymous ? quotedAnonIdentity?.avatar : post.originalPost.author?.avatar,
            gender: post.originalPost.isAnonymous ? "other" : post.originalPost.author?.gender,
            createdAt: post.originalPost.createdAt.toISOString(),
            isAnonymous: post.originalPost.isAnonymous,
          };
        }
      }

      return {
        id: post.id,
        postType: post.postType,
        avatar: post.isAnonymous ? anonIdentity?.avatar : post.author.avatar,
        name: post.isAnonymous ? anonIdentity?.name : post.author.nickname,
        isOwnedByCurrentUser: Boolean(currentUserId && post.authorId === currentUserId),
        gender: post.isAnonymous ? "other" : post.author.gender,
        gradeKey: post.isAnonymous ? undefined : post.author.grade,
        majorKey: post.isAnonymous ? undefined : post.author.major,
        meta: post.isAnonymous ? "" : [post.author.grade, post.author.major].filter(Boolean).join(" è·¯ "),
        createdAt: post.createdAt.toISOString(),
        lang: post.sourceLanguage,
        sourceLanguage: post.sourceLanguage,
        content: post.content,
        images: post.images,
        hasImage: post.images.length > 0,
        image: post.images[0],
        likes: post.likeCount,
        comments: post.commentCount,
        tags: post.tags,
        isAnonymous: post.isAnonymous,
        pollOptions: post.pollOptions?.map((option: any) => ({
          id: option.id,
          text: option.text,
          voteCount: option.voteCount,
        })),
        liked: likedPostIds.has(post.id),
        bookmarked: bookmarkedPostIds.has(post.id),
        quotedPost,
        functionRefPreview: ref ? previewsByEntity.get(`${ref.type}:${ref.id}`) : undefined,
        ...(vote
          ? {
              myVote: {
                id: vote.id,
                optionId: vote.optionId,
                createdAt: vote.createdAt.toISOString(),
              },
            }
          : {}),
      };
    });

    return NextResponse.json({
      success: true,
      data: { posts: hydrated, page, hasMore: hydrated.length === limit },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);

    const { allowed } = await checkCustomRateLimit(`rl:forum:post:${user.id}`, 60_000, 5);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many posts, please slow down" } },
        { status: 429 }
      );
    }

    const appLanguage = resolveRequestLanguage(req.headers, resolveAppLanguage(user.language));
    const body = await req.json();
    const data = createPostSchema.parse(body);

    if (data.postType === "poll" && (!data.pollOptions || data.pollOptions.length < 2)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_POLL", message: "Poll requires 2-10 options" } },
        { status: 400 }
      );
    }

    const sanitizedContent = DOMPurify.sanitize(data.content, { ALLOWED_TAGS: [] });

    const moderation = await moderateText(sanitizedContent);
    if (moderation.flagged) {
      return NextResponse.json(
        { success: false, error: { code: "CONTENT_VIOLATION", message: "Your post contains content that violates community guidelines", categories: moderation.categories } },
        { status: 400 }
      );
    }

    let anonymousIdentity = null;
    if (data.isAnonymous) {
      anonymousIdentity = generateDeterministicAnonymousIdentity(user.id, appLanguage);
    }
    const post = await prisma.post.create({
      data: {
        authorId: user.id,
        postType: data.postType,
        sourceLanguage: detectContentLanguage([sanitizedContent], resolveAppLanguage(user.language)),
        content: sanitizedContent,
        images: data.images ?? [],
        tags: data.tags ?? [],
        category: data.category ?? "forum",
        isAnonymous: data.isAnonymous ?? false,
        anonymousName: anonymousIdentity?.serializedName,
        anonymousAvatar: anonymousIdentity?.avatar,
        isRepost: data.quotedPostId ? true : undefined,
        originalPostId: data.quotedPostId,
        pollEndDate: data.pollEndDate ? new Date(data.pollEndDate) : null,
        partnerType: data.partnerType,
        eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
        price: data.price,
        errandType: data.errandType,
        startAddress: data.startAddress,
        endAddress: data.endAddress,
        taskEndTime: data.taskEndTime ? new Date(data.taskEndTime) : null,
        itemPrice: data.itemPrice,
        itemLocation: data.itemLocation,
        saleEndTime: data.saleEndTime ? new Date(data.saleEndTime) : null,
        pollOptions:
          data.postType === "poll" && data.pollOptions
            ? { create: data.pollOptions.map((text) => ({ text })) }
            : undefined,
      },
      include: {
        author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true } },
        pollOptions: true,
      },
    } as any);

    if (data.tags && data.tags.length > 0) {
      await prisma.$transaction(
        data.tags.map((name) =>
          prisma.tag.upsert({
            where: { name },
            create: { name, usageCount: 1 },
            update: { usageCount: { increment: 1 } },
          })
        )
      );
    }

    // Async broadcast push — only for regular forum posts, not marketplace/utility or reposts
    const postCategory = data.category ?? "forum";
    if (postCategory === "forum" && !data.quotedPostId) {
      broadcastNewPostPush({
        postId: post.id,
        authorId: user.id,
        authorName: user.nickname || user.userName || "Someone",
        isAnonymous: data.isAnonymous ?? false,
        contentPreview: sanitizedContent,
      }).catch(() => {});
    }

    // In-app realtime broadcast: fan out to every connected WebSocket so
    // their TanStack `posts` cache invalidates and the new entry appears
    // at the top of the feed without waiting for the 15s polling tick.
    //
    // Guarded to mirror the push-notification logic above:
    //   - forum category only (errand/partner/secondhand have separate lists)
    //   - skip reposts (already visible via the original)
    //   - skip anonymous posts so the WebSocket payload (which carries the
    //     real authorId for self-filter) cannot be cross-referenced with the
    //     server's anonymized GET response to de-anonymize the author.
    if (postCategory === "forum" && !data.quotedPostId && !data.isAnonymous) {
      messageEventBroker.broadcast({
        id: randomUUID(),
        type: "post:new",
        postId: post.id,
        authorId: user.id,
        createdAt: Date.now(),
      });
    }

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    return handleError(error, req);
  }
}
