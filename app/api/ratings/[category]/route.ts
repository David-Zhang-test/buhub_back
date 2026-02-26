import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

const VALID_CATEGORIES = ["COURSE", "TEACHER", "CANTEEN", "MAJOR"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category: rawCategory } = await params;
    const category = rawCategory.toUpperCase();
    const { searchParams } = new URL(req.url);
    const sortMode = searchParams.get("sortMode") || "recent";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CATEGORY", message: "Invalid category" } },
        { status: 400 }
      );
    }

    const items = await prisma.ratingItem.findMany({
      where: { category: category as "COURSE" | "TEACHER" | "CANTEEN" | "MAJOR" },
      include: {
        ratings: true,
      },
      skip,
      take: limit,
      orderBy: { name: "asc" },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const data = items.map((item) => {
      const scores = (item.ratings as { scores: Record<string, number> }[]).flatMap((r) =>
        Object.entries(r.scores || {}).map(([dim, val]) => ({ dimension: dim, value: val }))
      );
      const avgScores = scores.reduce(
        (acc, { dimension, value }) => {
          if (!acc[dimension]) acc[dimension] = { sum: 0, count: 0 };
          acc[dimension].sum += value;
          acc[dimension].count += 1;
          return acc;
        },
        {} as Record<string, { sum: number; count: number }>
      );
      const scoreArr = Object.entries(avgScores).map(([dim, { sum, count }]) => ({
        dimension: dim,
        value: count > 0 ? sum / count : 0,
      }));

      const allTags = item.ratings.flatMap((r) => r.tags || []);
      const tagCounts: Record<string, number> = {};
      for (const t of allTags) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }

      const recentCount = item.ratings.filter(
        (r) => r.createdAt && new Date(r.createdAt) > thirtyDaysAgo
      ).length;

      const variances = scoreArr.map((s) => Math.pow(s.value - 2.5, 2));
      const scoreVariance =
        variances.length > 0 ? variances.reduce((a, b) => a + b, 0) / variances.length : 0;

      return {
        id: item.id,
        name: item.name,
        department: item.department,
        code: item.code,
        email: item.email,
        location: item.location,
        scores: scoreArr,
        tags: Object.keys(tagCounts),
        tagCounts,
        ratingCount: item.ratings.length,
        recentCount,
        scoreVariance,
      };
    });

    if (sortMode === "controversial") {
      data.sort((a, b) => b.scoreVariance - a.scoreVariance);
    } else {
      data.sort((a, b) => b.recentCount - a.recentCount);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
