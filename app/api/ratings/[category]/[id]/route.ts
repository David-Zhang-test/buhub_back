import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

const VALID_CATEGORIES = ["COURSE", "TEACHER", "CANTEEN", "MAJOR"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }
) {
  try {
    const { category: rawCategory, id } = await params;
    const category = rawCategory.toUpperCase();

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CATEGORY", message: "Invalid category" } },
        { status: 400 }
      );
    }

    const item = await prisma.ratingItem.findFirst({
      where: {
        id,
        category: category as "COURSE" | "TEACHER" | "CANTEEN" | "MAJOR",
      },
      include: {
        ratings: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatar: true,
                userName: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 }
      );
    }

    const tagCounts: Record<string, number> = {};
    for (const r of item.ratings) {
      for (const t of r.tags || []) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...item,
        tagCounts,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
