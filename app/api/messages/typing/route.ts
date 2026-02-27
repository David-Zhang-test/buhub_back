import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
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

    const createdAt = Date.now();
    messageEventBroker.publish(toUserId, {
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
