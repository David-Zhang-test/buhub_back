import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageService } from "@/src/services/message.service";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

    if (!q) {
      return NextResponse.json({ success: true, data: [] });
    }

    const results = await messageService.searchConversations(user.id, q, limit);
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    return handleError(error);
  }
}
