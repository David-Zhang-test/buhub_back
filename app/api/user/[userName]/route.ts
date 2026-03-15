import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getCurrentUser } from "@/src/lib/auth";
import { findUserByHandle } from "@/src/services/user.service";
import { handleError } from "@/src/lib/errors";
import { hasVerifiedHkbuEmail } from "@/src/lib/user-emails";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userName: string }> }
) {
  try {
    const { userName } = await params;
    const targetUser = await findUserByHandle(userName);

    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      // Not logged in
    }

    if (currentUserId) {
      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: targetUser.id },
            { blockerId: targetUser.id, blockedId: currentUserId },
          ],
        },
      });
      if (blocked) {
        return NextResponse.json(
          { success: false, error: { code: "BLOCKED", message: "Cannot view this profile" } },
          { status: 403 }
        );
      }
    }

    const [postCount, followerCount, followingCount] = await Promise.all([
      prisma.post.count({ where: { authorId: targetUser.id, isDeleted: false } }),
      prisma.follow.count({ where: { followingId: targetUser.id } }),
      prisma.follow.count({ where: { followerId: targetUser.id } }),
    ]);

    let isFollowedByMe = false;
    if (currentUserId) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUser.id,
          },
        },
      });
      isFollowedByMe = !!follow;
    }

    const isHKBUVerified = await hasVerifiedHkbuEmail(targetUser.id);

    return NextResponse.json({
      success: true,
      data: {
        id: targetUser.id,
        userName: targetUser.userName ?? targetUser.nickname,
        nickname: targetUser.nickname,
        avatar: targetUser.avatar,
        gender: targetUser.gender,
        bio: targetUser.bio,
        grade: targetUser.grade ?? "",
        major: targetUser.major ?? "",
        isHKBUVerified,
        stats: {
          postCount,
          followerCount,
          followingCount,
        },
        isFollowedByMe,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
