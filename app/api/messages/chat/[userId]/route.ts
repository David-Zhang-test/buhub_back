import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { messageEventBroker } from "@/src/lib/message-events";
import { handleError } from "@/src/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userId: contactId } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const skip = (page - 1) * limit;

    if (contactId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID", message: "Cannot chat with yourself" } },
        { status: 400 }
      );
    }

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: contactId },
          { senderId: contactId, receiverId: user.id },
        ],
      },
      include: {
        sender: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const readUpdate = await prisma.directMessage.updateMany({
      where: {
        senderId: contactId,
        receiverId: user.id,
        isRead: false,
        isDeleted: false,
      },
      data: { isRead: true },
    });

    if (readUpdate.count > 0) {
      const createdAt = Date.now();
      messageEventBroker.publish(contactId, {
        id: `msg-read-${contactId}-${user.id}-${createdAt}`,
        type: "message:read",
        readerUserId: user.id,
        conversationUserId: user.id,
        createdAt,
      });
    }

    const data = messages.reverse().map((m) => ({
      id: m.id,
      sender: m.sender.nickname,
      content: m.content,
      text: m.content,
      images: m.images,
      isDeleted: m.isDeleted,
      isRead: m.isRead,
      createdAt: m.createdAt.toISOString(),
      time: m.createdAt.toISOString(),
      isMine: m.senderId === user.id,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
