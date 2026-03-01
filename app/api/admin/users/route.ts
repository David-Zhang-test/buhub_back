import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;
    const q = searchParams.get("q") || "";
    const role = searchParams.get("role") || undefined;
    const banned = searchParams.get("banned");

    const where: {
      OR?: object[];
      role?: string;
      isBanned?: boolean;
    } = {};
    if (q && q.length >= 1) {
      where.OR = [
        { nickname: { contains: q, mode: "insensitive" as const } },
        { userName: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ];
    }
    if (role) where.role = role;
    if (banned === "true") where.isBanned = true;
    if (banned === "false") where.isBanned = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          userName: true,
          nickname: true,
          avatar: true,
          role: true,
          isActive: true,
          isBanned: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: users, total });
  } catch (error) {
    return handleError(error);
  }
}
