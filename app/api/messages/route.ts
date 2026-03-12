import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageService } from "@/src/services/message.service";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";
import { isValidUploadedImageRef, normalizeUploadedImageRef } from "@/src/lib/upload-refs";
import { moderateText } from "@/src/lib/content-moderation";
import { z } from "zod";

const imageRefSchema = z.string().trim().refine(isValidUploadedImageRef, {
  message: "Invalid image reference",
});

const sendMessageSchema = z
  .object({
    receiverId: z.string().uuid(),
    content: z.string().max(2000).optional().default(""),
    images: z.array(imageRefSchema).max(9).optional().default([]),
  })
  .refine((payload) => payload.content.trim().length > 0 || payload.images.length > 0, {
    message: "Message content or image is required",
    path: ["content"],
  });

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = sendMessageSchema.parse(body);

    if (data.content.trim()) {
      const moderation = await moderateText(data.content);
      if (moderation.flagged) {
        return NextResponse.json(
          { success: false, error: { code: "CONTENT_VIOLATION", message: "Your message contains content that violates community guidelines", categories: moderation.categories } },
          { status: 400 }
        );
      }
    }

    const normalizedImages = data.images.map(normalizeUploadedImageRef);

    const message = await messageService.sendMessage({
      senderId: user.id,
      receiverId: data.receiverId,
      content: data.content.trim(),
      images: normalizedImages,
    });
    const [receiverConversation, senderConversation] = await Promise.all([
      messageService.getConversationSummary(message.receiverId, message.senderId),
      messageService.getConversationSummary(message.senderId, message.receiverId),
    ]);

    const createdAt = Date.now();
    const baseEvent = {
      id: `msg-new-${message.id}-${createdAt}`,
      type: "message:new" as const,
      messageId: message.id,
      fromUserId: message.senderId,
      toUserId: message.receiverId,
      message: {
        id: message.id,
        content: message.content,
        images: message.images,
        isDeleted: message.isDeleted,
        isRead: message.isRead,
        createdAt: message.createdAt.toISOString(),
        senderId: message.senderId,
        receiverId: message.receiverId,
      },
      createdAt,
    };
    messageEventBroker.publish(message.receiverId, {
      ...baseEvent,
      conversationUserId: message.senderId,
      conversation: receiverConversation,
    });
    messageEventBroker.publish(message.senderId, {
      ...baseEvent,
      conversationUserId: message.receiverId,
      conversation: senderConversation,
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    return handleError(error);
  }
}
