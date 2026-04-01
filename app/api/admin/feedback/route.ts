import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { Prisma, FeedbackStatus, FeedbackCategory } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;
    const status = searchParams.get("status");
    const category = searchParams.get("category");

    const where: Prisma.FeedbackWhereInput = {};
    if (status && ["PENDING", "REPLIED", "RESOLVED"].includes(status)) {
      where.status = status as FeedbackStatus;
    }
    if (category && ["BUG", "SUGGESTION", "OTHER"].includes(category)) {
      where.category = category as FeedbackCategory;
    }

    const [feedbacks, total, statusCounts] = await Promise.all([
      prisma.feedback.findMany({
        where,
        select: {
          id: true,
          category: true,
          description: true,
          imageUrls: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
            },
          },
          _count: {
            select: { replies: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.feedback.count({ where }),
      prisma.feedback.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    const stats: Record<string, number> = {
      PENDING: 0,
      REPLIED: 0,
      RESOLVED: 0,
    };
    statusCounts.forEach((s) => {
      stats[s.status] = s._count;
    });

    return NextResponse.json({ success: true, data: feedbacks, total, stats });
  } catch (error) {
    return handleError(error);
  }
}
