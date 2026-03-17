import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";

const NOTIF_DEDUPE_TTL = 5 * 60; // 5-minute deduplication window

type NotificationData = {
  userId: string;
  type: string;
  actorId: string;
  postId?: string;
  commentId?: string;
};

/**
 * Create a notification only if a duplicate doesn't already exist.
 * Uses Redis NX for fast atomic deduplication; falls back to DB check if Redis is unavailable.
 * Returns the created notification, or null if it was a duplicate.
 */
export async function createNotificationOnce(data: NotificationData) {
  const keyParts = [data.userId, data.type, data.actorId, data.postId ?? "", data.commentId ?? ""];
  const dedupeKey = `notif:dedupe:${keyParts.join(":")}`;

  try {
    const wasSet = await redis.set(dedupeKey, "1", "EX", NOTIF_DEDUPE_TTL, "NX");
    if (wasSet !== "OK") return null;
  } catch {
    // Redis unavailable — fall back to DB time-window check
    const existing = await prisma.notification.findFirst({
      where: {
        userId: data.userId,
        type: data.type,
        actorId: data.actorId,
        ...(data.postId ? { postId: data.postId } : {}),
        ...(data.commentId ? { commentId: data.commentId } : {}),
        createdAt: { gte: new Date(Date.now() - NOTIF_DEDUPE_TTL * 1000) },
      },
    });
    if (existing) return null;
  }

  return prisma.notification.create({ data });
}

/**
 * Build a push deduplication key for sendPushOnce.
 */
export function buildPushDedupeKey(
  type: string,
  actorId: string,
  targetUserId: string,
  resourceId: string,
): string {
  return `push:${type}:${actorId}:${targetUserId}:${resourceId}`;
}
