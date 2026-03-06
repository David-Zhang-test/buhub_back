import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim();
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "QUERY_TOO_SHORT", message: "Search query must be at least 1 character" },
        },
        { status: 400 }
      );
    }

    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      // Not logged in
    }

    const orConditions: object[] = [
      { nickname: { contains: query, mode: "insensitive" as const } },
      { userName: { contains: query, mode: "insensitive" as const } },
    ];
    if (query.includes("@")) {
      orConditions.push({ email: { contains: query, mode: "insensitive" as const } });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: orConditions,
        isActive: true,
        isBanned: false,
      },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        grade: true,
        major: true,
        bio: true,
      },
      skip,
      take: limit,
      orderBy: { nickname: "asc" },
    });

    let followedUserIds: string[] = [];
    if (currentUserId) {
      const follows = await prisma.follow.findMany({
        where: {
          followerId: currentUserId,
          followingId: { in: users.map((u) => u.id) },
        },
        select: { followingId: true },
      });
      followedUserIds = follows.map((f) => f.followingId);
    }

    return NextResponse.json({
      success: true,
      data: users.map((user) => ({
        ...user,
        isFollowed: currentUserId ? followedUserIds.includes(user.id) : undefined,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
