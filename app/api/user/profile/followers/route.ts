import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const followers = await prisma.follow.findMany({
      where: { followingId: user.id },
      include: {
        follower: {
          select: {
            id: true,
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            major: true,
            grade: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const followerIds = followers.map((f) => f.follower.id);
    const myFollows = await prisma.follow.findMany({
      where: {
        followerId: user.id,
        followingId: { in: followerIds },
      },
      select: { followingId: true },
    });
    const followedSet = new Set(myFollows.map((f) => f.followingId));

    return NextResponse.json({
      success: true,
      data: followers.map((f) => ({
        userName: f.follower.userName ?? f.follower.nickname,
        nickname: f.follower.nickname,
        avatar: f.follower.avatar,
        gender: f.follower.gender,
        bio: f.follower.bio,
        major: f.follower.major,
        grade: f.follower.grade,
        isFollowed: followedSet.has(f.follower.id),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
