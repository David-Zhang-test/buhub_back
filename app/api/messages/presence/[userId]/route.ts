import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";

const userIdSchema = z.string().uuid();

function onlineKey(userId: string) {
  return `presence:online:${userId}`;
}

function lastSeenKey(userId: string) {
  return `presence:last-seen:${userId}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await getCurrentUser(req);
    const { userId } = await params;
    const targetUserId = userIdSchema.parse(userId);

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true, isBanned: true },
    });
    if (!targetUser || !targetUser.isActive || targetUser.isBanned) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    const [onlineValue, lastSeenValue] = await redis.mget(
      onlineKey(targetUserId),
      lastSeenKey(targetUserId)
    );
    const isOnline = Boolean(onlineValue);
    const lastSeen = Number(onlineValue ?? lastSeenValue ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        isOnline,
        lastSeen: Number.isFinite(lastSeen) && lastSeen > 0 ? lastSeen : null,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
