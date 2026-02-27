import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { redis } from "@/src/lib/redis";

const ONLINE_TTL_SECONDS = 70;

function onlineKey(userId: string) {
  return `presence:online:${userId}`;
}

function lastSeenKey(userId: string) {
  return `presence:last-seen:${userId}`;
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const now = Date.now().toString();

    await redis
      .multi()
      .setex(onlineKey(user.id), ONLINE_TTL_SECONDS, now)
      .set(lastSeenKey(user.id), now)
      .exec();

    return NextResponse.json({
      success: true,
      data: {
        isOnline: true,
        lastSeen: Number(now),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const now = Date.now().toString();

    await redis
      .multi()
      .del(onlineKey(user.id))
      .set(lastSeenKey(user.id), now)
      .exec();

    return NextResponse.json({
      success: true,
      data: {
        isOnline: false,
        lastSeen: Number(now),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
