import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";
import { messageEventBroker } from "@/src/lib/message-events";
import { buildPushDedupeKey } from "@/src/lib/notification";
import { getBlockedUserIds } from "@/src/lib/blocks";
import { getActorDisplayName, sendPushOnce } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";

const schema = z.object({ userId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { userId: targetUserId } = schema.parse(body);

    if (targetUserId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TARGET", message: "Cannot follow yourself" } },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser || !targetUser.isActive) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    // Refuse follow when either side has blocked the other — matches the
    // WeChat convention that a blocked user cannot interact with the host.
    const blockedSet = new Set(await getBlockedUserIds(user.id));
    if (blockedSet.has(targetUserId)) {
      return NextResponse.json(
        { success: false, error: { code: "BLOCKED", message: "Cannot follow this user" } },
        { status: 403 }
      );
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetUserId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ success: true, data: { followed: true } });
    }

    await prisma.follow.create({
      data: {
        followerId: user.id,
        followingId: targetUserId,
      },
    });

    // At most one follow notification per (recipient, actor). Branch on prior state:
    //   - prior unread  → silent refresh (timestamp only, no badge bump, no push)
    //   - prior read    → delete + create fresh + notify
    //   - no prior      → create + notify
    const prior = await prisma.notification.findFirst({
      where: { userId: targetUserId, type: "follow", actorId: user.id },
      select: { id: true, isRead: true },
    });

    let isFreshUnread: boolean;
    if (prior && !prior.isRead) {
      await prisma.notification.update({
        where: { id: prior.id },
        data: { createdAt: new Date() },
      });
      isFreshUnread = false;
    } else {
      await prisma.$transaction([
        ...(prior ? [prisma.notification.delete({ where: { id: prior.id } })] : []),
        prisma.notification.create({
          data: { userId: targetUserId, type: "follow", actorId: user.id },
        }),
      ]);
      isFreshUnread = true;
    }

    if (isFreshUnread) {
      messageEventBroker.publish(targetUserId, {
        id: crypto.randomUUID(),
        type: "notification:new",
        notificationType: "follow",
        createdAt: Date.now(),
      });
      const recipientLang = await getUserLanguage(targetUserId);
      await sendPushOnce({
        dedupeKey: buildPushDedupeKey("follow", user.id, targetUserId, targetUserId),
        userId: targetUserId,
        title: "ULink",
        body: pushT(recipientLang, "follow", { actor: getActorDisplayName(user) }),
        data: {
          type: "follow",
          userName: user.userName ?? null,
          path: user.userName
            ? `profile/${encodeURIComponent(user.userName)}`
            : "notifications/followers",
        },
        category: "followers",
      });
    }

    return NextResponse.json({ success: true, data: { followed: true } });
  } catch (error) {
    return handleError(error);
  }
}
