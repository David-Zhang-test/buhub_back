import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getBlockedUserIds } from "@/src/lib/blocks";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20") || 20, 1), 50);
    const skip = (page - 1) * limit;

    const blockedUserIds = await getBlockedUserIds(user.id);
    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: "follow",
        ...(blockedUserIds.length > 0 ? { actorId: { notIn: blockedUserIds } } : {}),
      },
      include: {
        actor: {
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

    const actorIds = notifications
      .map((n) => n.actorId)
      .filter((id): id is string => Boolean(id));
    const followed = actorIds.length
      ? await prisma.follow.findMany({
          where: {
            followerId: user.id,
            followingId: { in: actorIds },
          },
          select: { followingId: true },
        })
      : [];
    const followedSet = new Set(followed.map((item) => item.followingId));

    const stillFollowingMe = actorIds.length
      ? await prisma.follow.findMany({
          where: {
            followerId: { in: actorIds },
            followingId: user.id,
          },
          select: { followerId: true },
        })
      : [];
    const stillFollowingMeSet = new Set(stillFollowingMe.map((item) => item.followerId));

    const invalidNotificationIds = notifications
      .filter((n) => !n.actor || (!n.actor.userName && !n.actor.nickname))
      .map((n) => n.id);
    if (invalidNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: invalidNotificationIds }, userId: user.id, type: "follow" },
      });
    }
    const invalidIdSet = new Set(invalidNotificationIds);
    const data = notifications
      .filter((n) => !invalidIdSet.has(n.id))
      .map((n) => ({
      id: n.id,
      user: n.actor?.nickname ?? n.actor?.userName ?? "",
      userName: n.actor?.userName ?? n.actor?.nickname ?? "",
      avatar: n.actor?.avatar,
      gender: n.actor?.gender ?? "other",
      bio: n.actor?.bio ?? "",
      time: n.createdAt.toISOString(),
      isFollowed: n.actorId ? followedSet.has(n.actorId) : false,
      isMutuallyFollowing: n.actorId
        ? followedSet.has(n.actorId) && stillFollowingMeSet.has(n.actorId)
        : false,
      isRead: n.isRead,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
