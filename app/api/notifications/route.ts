import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const skip = (page - 1) * limit;

    const where: { userId: string; isRead?: boolean } = { userId: user.id };
    if (unreadOnly) where.isRead = false;

    const notifications = await prisma.notification.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            userName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    return handleError(error);
  }
}
