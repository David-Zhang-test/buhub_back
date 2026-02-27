import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { messageEventBroker } from "@/src/lib/message-events";
import { handleError } from "@/src/lib/errors";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const message = await prisma.directMessage.findUnique({
      where: { id },
    });

    if (!message || message.receiverId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Message not found" } },
        { status: 404 }
      );
    }

    await prisma.directMessage.update({
      where: { id },
      data: { isRead: true },
    });

    const createdAt = Date.now();
    messageEventBroker.publish(message.senderId, {
      id: `msg-read-${id}-${createdAt}`,
      type: "message:read",
      messageId: id,
      readerUserId: user.id,
      conversationUserId: user.id,
      createdAt,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
