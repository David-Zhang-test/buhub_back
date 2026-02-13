import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";

const CACHE_KEY = "forum:circles";
const CACHE_TTL = 3600; // 1 hour

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const tags = await prisma.tag.findMany({
      orderBy: { usageCount: "desc" },
      take: 50,
    });

    const data = tags.map((t) => ({
      name: t.name,
      usageCount: t.usageCount,
    }));

    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(error);
  }
}
