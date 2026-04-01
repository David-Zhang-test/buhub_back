import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { messageService } from "@/src/services/message.service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userId: partnerId } = await params;

    if (!partnerId || partnerId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID", message: "Invalid conversation target" } },
        { status: 400 }
      );
    }

    await messageService.clearConversation(user.id, partnerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
