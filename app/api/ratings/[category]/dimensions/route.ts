import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

const VALID_CATEGORIES = ["COURSE", "TEACHER", "CANTEEN", "MAJOR"];

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

    const dimensions = await prisma.scoreDimension.findMany({
      where: { category: category as "COURSE" | "TEACHER" | "CANTEEN" | "MAJOR" },
      orderBy: { order: "asc" },
    });

    const data = dimensions.map((d) => ({
      name: d.name,
      label: d.label as Record<string, string>,
      order: d.order,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
