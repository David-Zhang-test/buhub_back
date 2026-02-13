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

    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followedUserIds = following.map((f) => f.followingId);

    if (followedUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

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

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        authorId: {
          in: followedUserIds.filter((id) => !blockedUserIds.includes(id)),
        },
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
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: posts,
    });
  } catch (error) {
    return handleError(error);
  }
}
