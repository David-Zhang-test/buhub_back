import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, type: "follow" },
      include: {
        actor: {
          select: {
            nickname: true,
            avatar: true,
            gender: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const data = notifications.map((n) => ({
      id: n.id,
      avatar: n.actor?.avatar,
      name: n.actor?.nickname,
      gender: n.actor?.gender ?? "other",
      time: n.createdAt.toISOString(),
      isRead: n.isRead,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
