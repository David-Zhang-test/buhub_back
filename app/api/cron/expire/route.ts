import { NextRequest, NextResponse } from "next/server";
import { expireOldPosts, getExpiringSoonPosts } from "@/src/services/expire.service";
import { sendExpiredTaskPushes, sendExpiringSoonTaskPushes } from "@/src/services/task-push.service";

export async function GET(req: NextRequest) {
  try {
    const CRON_SECRET = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!CRON_SECRET || token !== CRON_SECRET) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } },
        { status: 401 }
      );
    }
    const result = await expireOldPosts();
    const expiringSoon = await getExpiringSoonPosts(24);
    const [expiringSoonPushes, expiredPushes] = await Promise.all([
      sendExpiringSoonTaskPushes(24),
      sendExpiredTaskPushes(30),
    ]);

    return NextResponse.json({
      success: true,
      message: `Expired ${result.total} posts`,
      data: {
        expired: result,
        expiringSoon,
        pushes: {
          expiringSoon: expiringSoonPushes,
          expired: expiredPushes,
        },
      },
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Cron job failed" } },
      { status: 500 }
    );
  }
}
