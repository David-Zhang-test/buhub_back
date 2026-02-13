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

    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: following.map((f) => ({
        userName: f.following.userName ?? f.following.nickname,
        avatar: f.following.avatar,
        gender: f.following.gender,
        bio: f.following.bio,
        isFollowed: true,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
