import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { findUserByHandle } from "@/src/services/user.service";
import { handleError } from "@/src/lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userName: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userName } = await params;

    const targetUser = await findUserByHandle(userName);

    if (targetUser.id === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TARGET", message: "Cannot follow yourself" } },
        { status: 400 }
      );
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetUser.id,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: user.id,
            followingId: targetUser.id,
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: { followed: false },
      });
    }

    await prisma.follow.create({
      data: {
        followerId: user.id,
        followingId: targetUser.id,
      },
    });

    // Create notification for new follower
    await prisma.notification.create({
      data: {
        userId: targetUser.id,
        type: "follow",
        actorId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: { followed: true },
    });
  } catch (error) {
    return handleError(error);
  }
}
