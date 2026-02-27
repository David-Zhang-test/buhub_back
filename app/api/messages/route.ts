import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageService } from "@/src/services/message.service";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";
import { z } from "zod";

const imageRefSchema = z.string().trim().refine((value) => {
  if (!value) return false;
  if (value.startsWith("/uploads/") || value.startsWith("uploads/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, {
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

    const normalizedImages = data.images.map((img) =>
      img.startsWith("uploads/") ? `/${img}` : img
    );

    const message = await messageService.sendMessage({
      senderId: user.id,
      receiverId: data.receiverId,
      content: data.content.trim(),
      images: normalizedImages,
    });

    const createdAt = Date.now();
    const baseEvent = {
      id: `msg-new-${message.id}-${createdAt}`,
      type: "message:new" as const,
      messageId: message.id,
      fromUserId: message.senderId,
      toUserId: message.receiverId,
      createdAt,
    };
    messageEventBroker.publish(message.receiverId, {
      ...baseEvent,
      conversationUserId: message.senderId,
    });
    messageEventBroker.publish(message.senderId, {
      ...baseEvent,
      conversationUserId: message.receiverId,
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    return handleError(error);
  }
}
