import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userId: targetUserId } = await params;

    if (user.id === targetUserId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TARGET", message: "Cannot block yourself" } },
        { status: 400 }
      );
    }

    const existing = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: user.id,
          blockedId: targetUserId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "User already blocked",
      });
    }

    await prisma.block.create({
      data: {
        blockerId: user.id,
        blockedId: targetUserId,
      },
    });

    await redis.del(`user:${user.id}:blocked`);

    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: targetUserId },
          { followerId: targetUserId, followingId: user.id },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userId: targetUserId } = await params;

    await prisma.block.deleteMany({
      where: {
        blockerId: user.id,
        blockedId: targetUserId,
      },
    });

    await redis.del(`user:${user.id}:blocked`);

    return NextResponse.json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    return handleError(error);
  }
}
