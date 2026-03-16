import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { findUserByHandle } from "@/src/services/user.service";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";
import { getActorDisplayName, sendPushToUser } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userName: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userName } = await params;

    const targetUser = await findUserByHandle(userName);

    if (targetUser.id === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TARGET", message: "Cannot follow yourself" } },
        { status: 400 }
      );
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetUser.id,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: user.id,
            followingId: targetUser.id,
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: { followed: false },
      });
    }

    await prisma.follow.create({
      data: {
        followerId: user.id,
        followingId: targetUser.id,
      },
    });

    // Create notification for new follower
    await prisma.notification.create({
      data: {
        userId: targetUser.id,
        type: "follow",
        actorId: user.id,
      },
    });
    messageEventBroker.publish(targetUser.id, {
      id: crypto.randomUUID(),
      type: "notification:new",
      notificationType: "follow",
      createdAt: Date.now(),
    });
    const recipientLang = await getUserLanguage(targetUser.id);
    await sendPushToUser({
      userId: targetUser.id,
      title: pushT(recipientLang, "follow", { actor: getActorDisplayName(user) }),
      body: pushT(recipientLang, "fallback.profile"),
      data: {
        type: "follow",
        userName: user.userName ?? null,
        path: user.userName ? `profile/${encodeURIComponent(user.userName)}` : "notifications/followers",
      },
      category: "followers",
    });

    return NextResponse.json({
      success: true,
      data: { followed: true },
    });
  } catch (error) {
    return handleError(error);
  }
}
