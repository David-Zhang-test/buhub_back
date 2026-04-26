import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getLockerTimeline } from "@/src/lib/locker-config";
import { sendLockerBroadcastToAllSubmitters } from "@/src/services/expo-push.service";

const patchSchema = z.object({
  action: z.enum(["publish", "withdraw"]).optional(),
  message: z.string().trim().max(2000).optional(),
  featureEnabled: z.boolean().optional(),
  openAt: z.string().datetime({ offset: true }).optional(),
  closeAt: z.string().datetime({ offset: true }).optional(),
  announcementStartAt: z.string().datetime({ offset: true }).nullable().optional(),
  announcementEndAt: z.string().datetime({ offset: true }).nullable().optional(),
  notifySubmitters: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");
    const timeline = await getLockerTimeline();
    const row = await prisma.lockerBroadcast.findUnique({
      where: { id: "global" },
    });
    return NextResponse.json({
      success: true,
      data: {
        message: row?.message ?? "",
        updatedAt: row?.updatedAt ?? null,
        featureEnabled: row?.featureEnabled ?? true,
        openAt: timeline.openAtIso,
        closeAt: timeline.closeAtIso,
        announcementStartAt: timeline.announcementStartAtIso,
        announcementEndAt: timeline.announcementEndAtIso,
        isPublished: row?.isPublished ?? false,
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
    const {
      action,
      message,
      featureEnabled,
      openAt,
      closeAt,
      announcementStartAt,
      announcementEndAt,
      notifySubmitters,
    } = patchSchema.parse(body);

    if (openAt && closeAt && Date.parse(openAt) >= Date.parse(closeAt)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Open time must be earlier than close time.",
          },
        },
        { status: 400 }
      );
    }

    if (announcementStartAt && announcementEndAt && Date.parse(announcementStartAt) >= Date.parse(announcementEndAt)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Announcement start time must be earlier than end time.",
            },
          },
          { status: 400 }
        );
      }

    const row = await prisma.lockerBroadcast.upsert({
      where: { id: "global" },
      update: {
        ...(typeof message === "string" ? { message } : {}),
        ...(typeof featureEnabled === "boolean" ? { featureEnabled } : {}),
        ...(typeof openAt === "string" ? { openAt: new Date(openAt) } : {}),
        ...(typeof closeAt === "string" ? { closeAt: new Date(closeAt) } : {}),
        ...(announcementStartAt !== undefined ? { announcementStartAt: announcementStartAt ? new Date(announcementStartAt) : null } : {}),
        ...(announcementEndAt !== undefined ? { announcementEndAt: announcementEndAt ? new Date(announcementEndAt) : null } : {}),
        ...(action ? { isPublished: action === "publish" } : {}),
      },
      create: {
        id: "global",
        message: message ?? "",
        featureEnabled: typeof featureEnabled === "boolean" ? featureEnabled : true,
        ...(typeof openAt === "string" ? { openAt: new Date(openAt) } : {}),
        ...(typeof closeAt === "string" ? { closeAt: new Date(closeAt) } : {}),
        announcementStartAt: announcementStartAt ? new Date(announcementStartAt) : null,
        announcementEndAt: announcementEndAt ? new Date(announcementEndAt) : null,
        isPublished: action === "publish",
      },
    });
    if (action !== "withdraw" && notifySubmitters) {
      // Fire-and-forget push fan-out — don't block admin's response on network.
      void sendLockerBroadcastToAllSubmitters()
        .then((stats) => {
          console.log(
            `[locker-broadcast] push fan-out: ${stats.delivered}/${stats.userCount} delivered, ${stats.failed} failed`
          );
        })
        .catch((err) => {
          console.error("[locker-broadcast] push fan-out crashed", err);
        });
    }
    return NextResponse.json({
      success: true,
      data: {
        message: row.message,
        updatedAt: row.updatedAt,
        featureEnabled: row.featureEnabled,
        openAt: row.openAt?.toISOString() ?? null,
        closeAt: row.closeAt?.toISOString() ?? null,
        announcementStartAt: row.announcementStartAt?.toISOString() ?? null,
        announcementEndAt: row.announcementEndAt?.toISOString() ?? null,
        isPublished: row.isPublished,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
