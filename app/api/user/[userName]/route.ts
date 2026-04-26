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

    const [postCount, followerCount, followingCount, followRecord, reverseFollowRecord, isHKBUVerified] = await Promise.all([
      prisma.post.count({ where: { authorId: targetUser.id, isDeleted: false, isAnonymous: false } }),
      prisma.follow.count({ where: { followingId: targetUser.id } }),
      prisma.follow.count({ where: { followerId: targetUser.id } }),
      currentUserId
        ? prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentUserId,
                followingId: targetUser.id,
              },
            },
          })
        : null,
      currentUserId
        ? prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: targetUser.id,
                followingId: currentUserId,
              },
            },
          })
        : null,
      hasVerifiedHkbuEmail(targetUser.id),
    ]);

    const isFollowedByMe = !!followRecord;
    const isFollowedByThem = !!reverseFollowRecord;
    const isMutuallyFollowing = isFollowedByMe && isFollowedByThem;

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
        isFollowedByThem,
        isMutuallyFollowing,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
