import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: itemId } = await params;

    const item = await prisma.secondhandItem.findUnique({
      where: { id: itemId },
    });

    const now = new Date();
    const isExpiredByTime = !!item && item.expiresAt < now;
    if (isExpiredByTime && item && !item.expired) {
      await prisma.secondhandItem.update({
        where: { id: itemId },
        data: { expired: true },
      });
    }

    if (!item || item.expired || isExpiredByTime || item.sold) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item not found or unavailable" } },
        { status: 404 }
      );
    }
    if (item.authorId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID", message: "Cannot want your own item" } },
        { status: 400 }
      );
    }

    const existing = await prisma.secondhandWant.findUnique({
      where: { itemId_userId: { itemId, userId: user.id } },
    });

    if (existing) {
      await prisma.secondhandWant.delete({
        where: { itemId_userId: { itemId, userId: user.id } },
      });
      return NextResponse.json({ success: true, data: { wanted: false } });
    }

    await prisma.secondhandWant.create({
      data: { itemId, userId: user.id },
    });
    return NextResponse.json({ success: true, data: { wanted: true } });
  } catch (error) {
    return handleError(error);
  }
}
