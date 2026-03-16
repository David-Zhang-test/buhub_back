import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { messageEventBroker } from "@/src/lib/message-events";

const typingSchema = z.object({
  toUserId: z.string().uuid(),
  isTyping: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { toUserId, isTyping } = typingSchema.parse(body);

    if (toUserId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID", message: "Cannot send typing state to yourself" } },
        { status: 400 }
      );
    }

    // Rate limit: 1 typing event per 2 seconds per sender-receiver pair
    const { allowed } = await checkCustomRateLimit(
      `rl:typing:${user.id}:${toUserId}`, 2_000, 1
    );
    if (!allowed) {
      return NextResponse.json({ success: true });
    }

    const createdAt = Date.now();
    messageEventBroker.publishTransient(toUserId, {
      id: `typing-${user.id}-${toUserId}-${createdAt}`,
      type: "typing:update",
      fromUserId: user.id,
      toUserId,
      conversationUserId: user.id,
      isTyping,
      createdAt,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
