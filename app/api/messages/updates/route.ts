import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { messageEventBroker } from "@/src/lib/message-events";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const sinceRaw = searchParams.get("since");
    const since = Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : 0;
    const events = await messageEventBroker.poll(user.id, since, 25000);

    return NextResponse.json({
      success: true,
      data: {
        events,
        now: Date.now(),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

