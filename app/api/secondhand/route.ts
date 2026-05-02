import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { createSecondhandSchema } from "@/src/schemas/secondhand.schema";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage } from "@/src/lib/language";
import {
  localizeSecondhandCondition,
  normalizeSecondhandCondition,
} from "@/src/lib/secondhand-condition";
import { getBlockedUserIds } from "@/src/lib/blocks";

export async function GET(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await checkCustomRateLimit(`rl:secondhand:list:${clientIp}`, 60_000, 60);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 }
      );
    }

    const requestLanguage = resolveRequestLanguage(req.headers);
    let currentUserId: string | undefined;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      currentUserId = undefined;
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.toUpperCase() || undefined;
    const includeExpired = searchParams.get("includeExpired") === "true";
    const mine = searchParams.get("mine") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;
    // Batch-mark newly expired posts for DB consistency (fire-and-forget)
    void prisma.secondhandItem.updateMany({
      where: { expired: false, expiresAt: { lt: new Date() } },
      data: { expired: true },
    }).catch(() => {});

    const where: { expired?: boolean; expiresAt?: object; category?: "ELECTRONICS" | "BOOKS" | "FURNITURE" | "OTHER"; authorId?: string | { notIn: string[] } } = {};
    if (!includeExpired) {
      where.expired = false;
      where.expiresAt = { gt: new Date() };
    }
    if (category && ["ELECTRONICS", "BOOKS", "FURNITURE", "OTHER"].includes(category)) {
      where.category = category as "ELECTRONICS" | "BOOKS" | "FURNITURE" | "OTHER";
    }
    if (mine) {
      if (!currentUserId) {
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Login required" } },
          { status: 401 }
        );
      }
      where.authorId = currentUserId;
    } else if (currentUserId) {
      const blockedUserIds = await getBlockedUserIds(currentUserId);
      if (blockedUserIds.length > 0) {
        where.authorId = { notIn: blockedUserIds };
      }
    }
    const items = await prisma.secondhandItem.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
        ...(currentUserId
          ? {
              wants: {
                where: { userId: currentUserId },
                select: { userId: true },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: items.map((item) => ({
        ...item,
        condition: localizeSecondhandCondition(item.condition, requestLanguage),
        isWanted: currentUserId ? Array.isArray((item as { wants?: unknown[] }).wants) && ((item as { wants?: unknown[] }).wants?.length ?? 0) > 0 : false,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);
    const body = await req.json();
    const data = createSecondhandSchema.parse(body);

    const item = await prisma.secondhandItem.create({
      data: {
        authorId: user.id,
        category: data.category,
        type: data.type,
        sourceLanguage: detectContentLanguage(
          [data.title, data.description, data.location],
          resolveAppLanguage(user.language)
        ),
        title: data.title,
        description: data.description,
        price: data.price,
        condition: normalizeSecondhandCondition(data.condition),
        location: data.location,
        images: data.images ?? [],
        expiresAt: new Date(data.expiresAt),
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
      },
    });

    const requestLanguage = resolveRequestLanguage(req.headers);
    return NextResponse.json({
      success: true,
      data: {
        ...item,
        condition: localizeSecondhandCondition(item.condition, requestLanguage),
      },
    });
  } catch (error) {
    return handleError(error, req);
  }
}
