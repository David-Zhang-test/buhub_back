import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

function normalizeTag(rawTag: string) {
  return decodeURIComponent(rawTag).trim();
}

function circleFollowerKey(tag: string) {
  return `forum:circle:followers:${encodeURIComponent(tag)}`;
}

function userFollowedCirclesKey(userId: string) {
  return `forum:user:circles:${userId}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const { tag: rawTag } = await params;
    const tag = normalizeTag(rawTag);
    const key = circleFollowerKey(tag);

    const followerCount = await redis.scard(key);
    let followed = false;

    try {
      const { user } = await getCurrentUser(req);
      followed = (await redis.sismember(key, user.id)) === 1;
    } catch {
      followed = false;
    }

    return NextResponse.json({
      success: true,
      data: {
        tag,
        followerCount,
        followed,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { tag: rawTag } = await params;
    const tag = normalizeTag(rawTag);
    const key = circleFollowerKey(tag);

    const isFollowing = (await redis.sismember(key, user.id)) === 1;
    if (isFollowing) {
      await redis.srem(key, user.id);
      await redis.srem(userFollowedCirclesKey(user.id), encodeURIComponent(tag));
    } else {
      await redis.sadd(key, user.id);
      await redis.sadd(userFollowedCirclesKey(user.id), encodeURIComponent(tag));
    }

    const followerCount = await redis.scard(key);

    return NextResponse.json({
      success: true,
      data: {
        tag,
        followerCount,
        followed: !isFollowing,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
