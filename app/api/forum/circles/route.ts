import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

const CACHE_KEY = "forum:circles";
const CACHE_TTL = 3600; // 1 hour

function circleFollowerKey(tag: string) {
  return `forum:circle:followers:${encodeURIComponent(tag)}`;
}

function userFollowedCirclesKey(userId: string) {
  return `forum:user:circles:${userId}`;
}

export async function GET(req: NextRequest) {
  try {
    const followedOnly = req.nextUrl.searchParams.get("followedOnly") === "1";
    let tags: { name: string; usageCount: number }[];

    if (followedOnly) {
      tags = await prisma.tag.findMany({
        orderBy: { usageCount: "desc" },
      }).then((rows) =>
        rows.map((t) => ({
          name: t.name,
          usageCount: t.usageCount,
        }))
      );
    } else {
      const cached = await redis.get(CACHE_KEY);
      tags =
        cached
          ? (JSON.parse(cached) as { name: string; usageCount: number }[])
          : await prisma.tag.findMany({
              orderBy: { usageCount: "desc" },
              take: 50,
            }).then((rows) =>
              rows.map((t) => ({
                name: t.name,
                usageCount: t.usageCount,
              }))
            );

      if (!cached) {
        await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(tags));
      }
    }

    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      currentUserId = null;
    }

    let followedTagSet = new Set<string>();
    if (currentUserId) {
      const reverseIndex = await redis.smembers(userFollowedCirclesKey(currentUserId));
      followedTagSet = new Set(
        reverseIndex.map((tag) => decodeURIComponent(tag))
      );

      if (followedTagSet.size === 0) {
        const membershipChecks = await Promise.all(
          tags.map(async (tag) => ({
            tag: tag.name,
            followed: (await redis.sismember(circleFollowerKey(tag.name), currentUserId!)) === 1,
          }))
        );
        followedTagSet = new Set(
          membershipChecks.filter((item) => item.followed).map((item) => item.tag)
        );
      }
    }

    const baseTags = followedOnly
      ? tags.filter((tag) => followedTagSet.has(tag.name))
      : tags;

    const followerCounts = await Promise.all(
      baseTags.map((tag) => redis.scard(circleFollowerKey(tag.name)))
    );

    const data = baseTags.map((tag, index) => ({
      name: tag.name,
      usageCount: tag.usageCount,
      followerCount: followerCounts[index] ?? 0,
      followed: currentUserId ? followedTagSet.has(tag.name) : false,
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(error);
  }
}
