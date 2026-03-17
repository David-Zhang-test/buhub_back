import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

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
      orConditions.push({ authorId: { in: safeUserIds } });
    }
    if (followedTags.length > 0) {
      orConditions.push({ tags: { hasSome: followedTags } });
    }

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        OR: orConditions,
        ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
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

    return NextResponse.json({
      success: true,
      data: { posts: resultPosts, hasMore, page },
    });
  } catch (error) {
    return handleError(error);
  }
}
