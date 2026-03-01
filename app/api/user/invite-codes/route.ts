import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const codes = await prisma.inviteCode.findMany({
      where: { ownerUserId: user.id },
      select: {
        id: true,
        code: true,
        createdAt: true,
        usedAt: true,
        usedByUser: {
          select: {
            id: true,
            userName: true,
            nickname: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: codes.map((item) => ({
        id: item.id,
        code: item.code,
        createdAt: item.createdAt,
        usedAt: item.usedAt,
        status: item.usedAt ? "used" : "unused",
        usedBy: item.usedByUser
          ? {
              id: item.usedByUser.id,
              userName: item.usedByUser.userName,
              nickname: item.usedByUser.nickname,
              email: item.usedByUser.email,
            }
          : null,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
