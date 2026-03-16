import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageService } from "@/src/services/message.service";
import { handleError } from "@/src/lib/errors";
import { messageEventBroker } from "@/src/lib/message-events";
import { isValidUploadedImageRef, normalizeUploadedImageRef } from "@/src/lib/upload-refs";
import { moderateText, moderateImageUrl } from "@/src/lib/content-moderation";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { buildDirectMessagePushPreview, getActorDisplayName, sendPushToUser } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";
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

    // Rate limit: 30 messages per 60 seconds per user
    const { allowed } = await checkCustomRateLimit(`rl:msg:send:${user.id}`, 60_000, 30);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many messages, please slow down" } },
        { status: 429 }
      );
    }

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

    // Asynchronous image moderation (fire-and-forget, fail-open)
    if (normalizedImages.length > 0) {
      const origin = req.headers.get("x-forwarded-proto") === "https"
        ? `https://${req.headers.get("host")}`
        : `http://${req.headers.get("host") || "localhost:3000"}`;
      void Promise.all(
        normalizedImages.map((ref) => {
          const url = ref.startsWith("http") ? ref : `${origin}${ref}`;
          return moderateImageUrl(url);
        })
      ).then(async (results) => {
        const flagged = results.some((r) => r.flagged);
        if (flagged) {
          const { prisma } = await import("@/src/lib/db");
          await prisma.directMessage.update({
            where: { id: message.id },
            data: { isDeleted: true, content: "", images: [] },
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    const recipientLang = await getUserLanguage(message.receiverId);
    const pushBody =
      buildDirectMessagePushPreview(message.content, message.images, 90, recipientLang) ||
      pushT(recipientLang, "fallback.message");

    await sendPushToUser({
      userId: message.receiverId,
      title: pushT(recipientLang, "message.new", { actor: getActorDisplayName({ nickname: message.sender.nickname }) }),
      body: pushBody,
      category: "messages",
      data: {
        type: "message",
        path: `chat/${message.senderId}`,
        contactId: message.senderId,
        contactName: message.sender.nickname,
        contactAvatar: message.sender.avatar,
      },
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    return handleError(error);
  }
}
