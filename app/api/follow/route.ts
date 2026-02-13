import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const schema = z.object({ userId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { userId: targetUserId } = schema.parse(body);

    if (targetUserId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TARGET", message: "Cannot follow yourself" } },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser || !targetUser.isActive) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetUserId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ success: true, data: { followed: true } });
    }

    await prisma.follow.create({
      data: {
        followerId: user.id,
        followingId: targetUserId,
      },
    });

    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: "follow",
        actorId: user.id,
      },
    });

    return NextResponse.json({ success: true, data: { followed: true } });
  } catch (error) {
    return handleError(error);
  }
}
