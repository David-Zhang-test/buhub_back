import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageService } from "@/src/services/message.service";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const sendMessageSchema = z.object({
  receiverId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  images: z.array(z.string().url()).max(9).optional().default([]),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = sendMessageSchema.parse(body);

    const message = await messageService.sendMessage({
      senderId: user.id,
      receiverId: data.receiverId,
      content: data.content,
      images: data.images,
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    return handleError(error);
  }
}
