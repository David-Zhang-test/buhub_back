import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getLockerTimeline } from "@/src/lib/locker-config";

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser(req);
    const timeline = await getLockerTimeline();
    const row = await prisma.lockerBroadcast.findUnique({
      where: { id: "global" },
    });
    return NextResponse.json({
      success: true,
      data: {
        message: row?.isPublished ? row.message : null,
        updatedAt: row?.updatedAt ?? null,
        featureEnabled: row?.featureEnabled ?? true,
        openAt: timeline.openAtIso,
        closeAt: timeline.closeAtIso,
        announcementStartAt: timeline.announcementStartAtIso,
        announcementEndAt: timeline.announcementEndAtIso,
        dropOffDate1: timeline.dropOffDate1Iso,
        dropOffDate2: timeline.dropOffDate2Iso,
        dropOffDate3: timeline.dropOffDate3Iso,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
