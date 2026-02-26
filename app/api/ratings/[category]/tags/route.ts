import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

const VALID_CATEGORIES = ["COURSE", "TEACHER", "CANTEEN", "MAJOR"];

const DEFAULT_TAGS: Record<string, string[]> = {
  COURSE: ["Interesting", "Easy", "Hard", "Well-organized", "Useful", "Boring"],
  TEACHER: ["Helpful", "Clear", "Strict", "Fair", "Knowledgeable"],
  CANTEEN: ["Tasty", "Cheap", "Fast", "Clean", "Variety"],
  MAJOR: ["Job prospects", "Interesting", "Hard", "Worth it"],
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category: rawCategory } = await params;
    const category = rawCategory.toUpperCase();

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CATEGORY", message: "Invalid category" } },
        { status: 400 }
      );
    }

    const ratings = await prisma.rating.findMany({
      where: {
        item: { category: category as "COURSE" | "TEACHER" | "CANTEEN" | "MAJOR" },
      },
      select: { tags: true },
    });

    const tagSet = new Set<string>();
    for (const r of ratings) {
      for (const t of r.tags || []) {
        tagSet.add(t);
      }
    }

    const data = tagSet.size > 0 ? Array.from(tagSet).sort() : DEFAULT_TAGS[category] ?? [];

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
