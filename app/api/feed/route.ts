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
    const sortBy = searchParams.get("sortBy") || "recent";
    const skip = (page - 1) * limit;

    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followedUserIds = following.map((f) => f.followingId);

    const cacheKey = `user:${user.id}:blocked`;
    let blockedUserIds: string[] = [];
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        blockedUserIds = JSON.parse(cached);
      } catch {
        // Invalid cache, fetch fresh
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

    const whereClause: {
      isDeleted: boolean;
      authorId: { notIn: string[] };
      OR?: object[];
    } = {
      isDeleted: false,
      authorId: { notIn: blockedUserIds },
    };

    if (followedUserIds.length > 0) {
      whereClause.OR = [
        { authorId: { in: followedUserIds } },
        { likeCount: { gte: 10 } },
      ];
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
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
      take: limit,
      orderBy:
        sortBy === "popular"
          ? [{ likeCount: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: posts,
    });
  } catch (error) {
    return handleError(error);
  }
}
