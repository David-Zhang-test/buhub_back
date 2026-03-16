import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { createErrandSchema } from "@/src/schemas/errand.schema";
import { detectContentLanguage, resolveAppLanguage } from "@/src/lib/language";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";

export async function GET(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await checkCustomRateLimit(`rl:errand:list:${clientIp}`, 60_000, 60);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.toUpperCase() || undefined;
    const includeExpired = searchParams.get("includeExpired") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;
    const where: { expired?: boolean; expiresAt?: object; category?: "PICKUP" | "BUY" | "OTHER" } = {};
    if (!includeExpired) {
      where.expired = false;
      where.expiresAt = { gt: new Date() };
    }
    if (category && ["PICKUP", "BUY", "OTHER"].includes(category)) {
      where.category = category as "PICKUP" | "BUY" | "OTHER";
    }

    const errands = await prisma.errand.findMany({
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

    return NextResponse.json({ success: true, data: errands });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);
    const body = await req.json();
    const data = createErrandSchema.parse(body);

    const errand = await prisma.errand.create({
      data: {
        authorId: user.id,
        category: data.category,
        type: data.type,
        sourceLanguage: detectContentLanguage(
          [data.title, data.description, data.from, data.to, data.item, data.time],
          resolveAppLanguage(user.language)
        ),
        title: data.title,
        description: data.description,
        from: data.from,
        to: data.to,
        price: data.price,
        item: data.item,
        time: data.time,
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

    return NextResponse.json({ success: true, data: errand });
  } catch (error) {
    return handleError(error, req);
  }
}
