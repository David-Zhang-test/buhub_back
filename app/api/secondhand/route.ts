import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createSecondhandSchema } from "@/src/schemas/secondhand.schema";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage } from "@/src/lib/language";
import {
  localizeSecondhandCondition,
  normalizeSecondhandCondition,
} from "@/src/lib/secondhand-condition";

export async function GET(req: NextRequest) {
  try {
    const requestLanguage = resolveRequestLanguage(req.headers);
    let currentUserId: string | undefined;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      currentUserId = undefined;
    }

    const now = new Date();
    await prisma.secondhandItem.updateMany({
      where: {
        expired: false,
        expiresAt: { lt: now },
      },
      data: { expired: true },
    });

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.toUpperCase() || undefined;
    const sold = searchParams.get("sold");
    const includeExpired = searchParams.get("includeExpired") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;
    const where: { expired?: boolean; category?: "ELECTRONICS" | "BOOKS" | "FURNITURE" | "OTHER"; sold?: boolean } = {};
    if (!includeExpired) {
      where.expired = false;
    }
    if (category && ["ELECTRONICS", "BOOKS", "FURNITURE", "OTHER"].includes(category)) {
      where.category = category as "ELECTRONICS" | "BOOKS" | "FURNITURE" | "OTHER";
    }
    if (sold === "true") where.sold = true;
    if (sold === "false") where.sold = false;

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
