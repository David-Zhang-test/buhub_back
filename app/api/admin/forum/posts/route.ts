import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    const where: { isDeleted?: boolean } = {};
    if (!includeDeleted) where.isDeleted = false;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              userName: true,
              avatar: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: posts, total });
  } catch (error) {
    return handleError(error);
  }
}
