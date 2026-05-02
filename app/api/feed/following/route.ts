import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";
import { parseFunctionRef, resolveFunctionRefPreviews } from "@/src/lib/function-ref";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const cursorParam = searchParams.get("cursor");
    const cursorDate = cursorParam ? new Date(cursorParam) : null;
    const useCursor = !!cursorDate && !isNaN(cursorDate.getTime());
    const skip = useCursor ? 0 : (page - 1) * limit;

    // Get followed users
    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followedUserIds = following.map((f) => f.followingId);

    // Get followed circle tags from Redis
    const circlesKey = `forum:user:circles:${user.id}`;
    const followedTags = await redis.smembers(circlesKey);

    if (followedUserIds.length === 0 && followedTags.length === 0) {
      return NextResponse.json({
        success: true,
        data: { posts: [], hasMore: false, page },
      });
    }

    // Get blocked users
    const cacheKey = `user:${user.id}:blocked`;
    let blockedUserIds: string[] = [];
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        blockedUserIds = JSON.parse(cached);
      } catch {
        /* invalid cache */
      }
    }
    if (blockedUserIds.length === 0) {
      const blocked = await prisma.block.findMany({
        where: {
          OR: [{ blockerId: user.id }, { blockedId: user.id }],
        },
        select: { blockedId: true, blockerId: true },
      });
      blockedUserIds = [
        ...blocked.filter((b) => b.blockerId === user.id).map((b) => b.blockedId),
        ...blocked.filter((b) => b.blockedId === user.id).map((b) => b.blockerId),
      ];
      await redis.setex(cacheKey, 300, JSON.stringify(blockedUserIds));
    }

    // Build OR conditions: followed users' posts OR posts with followed tags
    const orConditions: object[] = [];
    const safeUserIds = followedUserIds.filter((id) => !blockedUserIds.includes(id));
    if (safeUserIds.length > 0) {
      orConditions.push({
        authorId: { in: safeUserIds },
        isAnonymous: false,
      });
    }
    if (followedTags.length > 0) {
      orConditions.push({ tags: { hasSome: followedTags } });
    }

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        isAnonymous: false,
        OR: orConditions,
        ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
        ...(useCursor ? { createdAt: { lt: cursorDate! } } : {}),
      },
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
        pollOptions: true,
      },
      skip,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
    });

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const parsedRefsByPostId = new Map(
      resultPosts.map((post) => [post.id, parseFunctionRef(post.content).ref]),
    );
    const previewsByEntity = await resolveFunctionRefPreviews(
      Array.from(parsedRefsByPostId.values()).filter((ref): ref is NonNullable<typeof ref> => Boolean(ref)),
    );

    let likedPostIds = new Set<string>();
    let bookmarkedPostIds = new Set<string>();
    if (resultPosts.length > 0) {
      const postIds = resultPosts.map((p) => p.id);
      const [likes, bookmarks] = await Promise.all([
        prisma.like.findMany({
          where: { userId: user.id, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.bookmark.findMany({
          where: { userId: user.id, postId: { in: postIds } },
          select: { postId: true },
        }),
      ]);
      likedPostIds = new Set(likes.map((l) => l.postId).filter(Boolean) as string[]);
      bookmarkedPostIds = new Set(bookmarks.map((b) => b.postId).filter(Boolean) as string[]);
    }

    const nextCursor =
      hasMore && resultPosts.length > 0
        ? resultPosts[resultPosts.length - 1].createdAt.toISOString()
        : undefined;
    return NextResponse.json({
      success: true,
      data: {
        posts: resultPosts.map((post) => {
          const ref = parsedRefsByPostId.get(post.id);
          return {
            ...post,
            functionRefPreview: ref ? previewsByEntity.get(`${ref.type}:${ref.id}`) : undefined,
            liked: likedPostIds.has(post.id),
            bookmarked: bookmarkedPostIds.has(post.id),
          };
        }),
        hasMore,
        page,
        ...(nextCursor ? { nextCursor } : {}),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
