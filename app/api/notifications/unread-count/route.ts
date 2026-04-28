import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getBlockedUserIds } from "@/src/lib/blocks";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const blockedUserIds = await getBlockedUserIds(user.id);
    const actorBlockClause = blockedUserIds.length > 0
      ? { actorId: { notIn: blockedUserIds } }
      : {};

    const [likes, followers, comments, messages] = await Promise.all([
      prisma.notification.count({ where: { userId: user.id, type: "like", isRead: false, ...actorBlockClause } }),
      prisma.notification.count({ where: { userId: user.id, type: "follow", isRead: false, ...actorBlockClause } }),
      prisma.notification.count({
        where: { userId: user.id, type: { in: ["comment", "mention"] }, isRead: false, ...actorBlockClause },
      }),
      prisma.directMessage.count({
        where: { receiverId: user.id, isRead: false, isDeleted: false },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        likes,
        followers,
        comments,
        messages,
        total: likes + followers + comments + messages,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
