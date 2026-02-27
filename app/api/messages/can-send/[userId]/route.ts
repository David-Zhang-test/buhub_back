import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageService } from "@/src/services/message.service";
import { handleError } from "@/src/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { userId: contactId } = await params;

    if (contactId === user.id) {
      return NextResponse.json(
        { success: true, data: { canSendMessage: false } },
        { status: 200 }
      );
    }

    const canSendMessage = await messageService.canSendMessage(user.id, contactId);

    return NextResponse.json({
      success: true,
      data: { canSendMessage },
    });
  } catch (error) {
    return handleError(error);
  }
}

