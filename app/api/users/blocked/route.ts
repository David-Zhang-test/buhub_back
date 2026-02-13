import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const blocked = await prisma.block.findMany({
      where: { blockerId: user.id },
      include: {
        blocked: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: blocked.map((b) => ({
        id: b.blocked.id,
        nickname: b.blocked.nickname,
        avatar: b.blocked.avatar,
        blockedAt: b.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
