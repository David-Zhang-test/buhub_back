import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { messageEventBroker } from "@/src/lib/message-events";
import { handleError } from "@/src/lib/errors";
import { messageService } from "@/src/services/message.service";

const RECALL_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const message = await prisma.directMessage.findUnique({
      where: { id },
    });

    if (!message || message.senderId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Message not found" } },
        { status: 404 }
      );
    }

    const elapsed = Date.now() - message.createdAt.getTime();
    if (elapsed > RECALL_WINDOW_MS) {
      return NextResponse.json(
        { success: false, error: { code: "RECALL_EXPIRED", message: "Message can only be recalled within 2 minutes" } },
        { status: 400 }
      );
    }

    await prisma.directMessage.update({
      where: { id },
      data: {
        isDeleted: true,
        content: "",
        images: [],
      },
    });
    const [senderConversation, receiverConversation] = await Promise.all([
      messageService.getConversationSummary(message.senderId, message.receiverId),
      messageService.getConversationSummary(message.receiverId, message.senderId),
    ]);

    const createdAt = Date.now();
    const baseEvent = {
      id: `msg-recall-${id}-${createdAt}`,
      type: "message:recalled" as const,
      messageId: id,
      operatorUserId: user.id,
      createdAt,
    };
    messageEventBroker.publish(message.senderId, {
      ...baseEvent,
      conversationUserId: message.receiverId,
      conversation: senderConversation,
    });
    messageEventBroker.publish(message.receiverId, {
      ...baseEvent,
      conversationUserId: message.senderId,
      conversation: receiverConversation,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
