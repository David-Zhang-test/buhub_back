import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
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

    if (user.id === targetUser.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TARGET", message: "Cannot block yourself" } },
        { status: 400 }
      );
    }

    const existing = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: user.id,
          blockedId: targetUser.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: { blocked: true },
      });
    }

    await prisma.block.create({
      data: {
        blockerId: user.id,
        blockedId: targetUser.id,
      },
    });

    await redis.del(`user:${user.id}:blocked`, `user:${targetUser.id}:blocked`);

    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: targetUser.id },
          { followerId: targetUser.id, followingId: user.id },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      data: { blocked: true },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userName: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userName } = await params;

    const targetUser = await findUserByHandle(userName);

    await prisma.block.deleteMany({
      where: {
        blockerId: user.id,
        blockedId: targetUser.id,
      },
    });

    await redis.del(`user:${user.id}:blocked`, `user:${targetUser.id}:blocked`);

    return NextResponse.json({
      success: true,
      data: { blocked: false },
    });
  } catch (error) {
    return handleError(error);
  }
}
