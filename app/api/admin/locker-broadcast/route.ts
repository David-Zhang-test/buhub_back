import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { COLLECTION_DEADLINE_ISO } from "@/src/lib/locker-config";
import { sendLockerBroadcastToAllSubmitters } from "@/src/services/expo-push.service";

const patchSchema = z.object({
  message: z.string().trim().max(2000),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");
    const row = await prisma.lockerBroadcast.findUnique({
      where: { id: "global" },
    });
    return NextResponse.json({
      success: true,
      data: {
        message: row?.message ?? "",
        updatedAt: row?.updatedAt ?? null,
        collectionDeadline: COLLECTION_DEADLINE_ISO,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");
    const body = await req.json();
    const { message } = patchSchema.parse(body);
    const row = await prisma.lockerBroadcast.upsert({
      where: { id: "global" },
      update: { message },
      create: { id: "global", message },
    });
    // Fire-and-forget push fan-out — don't block admin's response on network.
    // Errors are logged inside the helper; individual delivery failures don't
    // affect the overall save success.
    void sendLockerBroadcastToAllSubmitters()
      .then((stats) => {
        console.log(
          `[locker-broadcast] push fan-out: ${stats.delivered}/${stats.userCount} delivered, ${stats.failed} failed`,
        );
      })
      .catch((err) => {
        console.error("[locker-broadcast] push fan-out crashed", err);
      });
    return NextResponse.json({
      success: true,
      data: {
        message: row.message,
        updatedAt: row.updatedAt,
        collectionDeadline: COLLECTION_DEADLINE_ISO,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
