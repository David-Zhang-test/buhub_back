import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { createPartnerSchema } from "@/src/schemas/partner.schema";
import { detectContentLanguage, resolveAppLanguage } from "@/src/lib/language";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { getBlockedUserIds } from "@/src/lib/blocks";

export async function GET(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await checkCustomRateLimit(`rl:partner:list:${clientIp}`, 60_000, 60);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.toUpperCase() || undefined;
    const includeExpired = searchParams.get("includeExpired") === "true";
    const mine = searchParams.get("mine") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;
    // Batch-mark newly expired posts for DB consistency (fire-and-forget)
    void prisma.partnerPost.updateMany({
      where: { expired: false, expiresAt: { lt: new Date() } },
      data: { expired: true },
    }).catch(() => {});

    const where: { expired?: boolean; expiresAt?: object; category?: "TRAVEL" | "FOOD" | "COURSE" | "SPORTS" | "OTHER"; authorId?: string | { notIn: string[] } } = {};
    if (!includeExpired) {
      where.expired = false;
      where.expiresAt = { gt: new Date() };
    }
    if (category && ["TRAVEL", "FOOD", "COURSE", "SPORTS", "OTHER"].includes(category)) {
      where.category = category as "TRAVEL" | "FOOD" | "COURSE" | "SPORTS" | "OTHER";
    }

    // Hide posts authored by users the viewer has blocked, or who have
    // blocked the viewer. Anonymous viewers see the unfiltered feed.
    let viewerId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      viewerId = user.id;
    } catch {
      viewerId = null;
    }
    if (mine) {
      if (!viewerId) {
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Login required" } },
          { status: 401 }
        );
      }
      where.authorId = viewerId;
    } else if (viewerId) {
      const blockedUserIds = await getBlockedUserIds(viewerId);
      if (blockedUserIds.length > 0) {
        where.authorId = { notIn: blockedUserIds };
      }
    }

    const posts = await prisma.partnerPost.findMany({
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
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({ success: true, data: posts });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);
    const body = await req.json();
    const data = createPartnerSchema.parse(body);

    const post = await prisma.partnerPost.create({
      data: {
        authorId: user.id,
        category: data.category,
        type: data.type,
        sourceLanguage: detectContentLanguage(
          [data.title, data.description, data.time, data.location],
          resolveAppLanguage(user.language)
        ),
        title: data.title,
        description: data.description,
        time: data.time,
        location: data.location,
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

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    return handleError(error, req);
  }
}
