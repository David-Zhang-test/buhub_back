import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getLockerTimeline } from "@/src/lib/locker-config";
import { sendLockerBroadcastToAllSubmitters } from "@/src/services/expo-push.service";
import { child } from "@/src/lib/logger";

const log = child("locker-broadcast");

const patchSchema = z.object({
  action: z.enum(["publish", "withdraw"]).optional(),
  message: z.string().trim().max(2000).optional(),
  featureEnabled: z.boolean().optional(),
  openAt: z.string().datetime({ offset: true }).optional(),
  closeAt: z.string().datetime({ offset: true }).optional(),
  dropOffDate1: z.string().datetime({ offset: true }).nullable().optional(),
  dropOffDate2: z.string().datetime({ offset: true }).nullable().optional(),
  dropOffDate3: z.string().datetime({ offset: true }).nullable().optional(),
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
        dropOffDate1: timeline.dropOffDate1Iso,
        dropOffDate2: timeline.dropOffDate2Iso,
        dropOffDate3: timeline.dropOffDate3Iso,
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
      dropOffDate1,
      dropOffDate2,
      dropOffDate3,
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

    const row = await prisma.lockerBroadcast.upsert({
      where: { id: "global" },
      update: {
        ...(typeof message === "string" ? { message } : {}),
        ...(typeof featureEnabled === "boolean" ? { featureEnabled } : {}),
        ...(typeof openAt === "string" ? { openAt: new Date(openAt) } : {}),
        ...(typeof closeAt === "string" ? { closeAt: new Date(closeAt) } : {}),
        ...(dropOffDate1 !== undefined ? { dropOffDate1: dropOffDate1 ? new Date(dropOffDate1) : null } : {}),
        ...(dropOffDate2 !== undefined ? { dropOffDate2: dropOffDate2 ? new Date(dropOffDate2) : null } : {}),
        ...(dropOffDate3 !== undefined ? { dropOffDate3: dropOffDate3 ? new Date(dropOffDate3) : null } : {}),
        ...(action ? { isPublished: action === "publish" } : {}),
      },
      create: {
        id: "global",
        message: message ?? "",
        featureEnabled: typeof featureEnabled === "boolean" ? featureEnabled : true,
        ...(typeof openAt === "string" ? { openAt: new Date(openAt) } : {}),
        ...(typeof closeAt === "string" ? { closeAt: new Date(closeAt) } : {}),
        dropOffDate1: dropOffDate1 ? new Date(dropOffDate1) : null,
        dropOffDate2: dropOffDate2 ? new Date(dropOffDate2) : null,
        dropOffDate3: dropOffDate3 ? new Date(dropOffDate3) : null,
        isPublished: action === "publish",
      },
    });
    if (action !== "withdraw" && notifySubmitters) {
      // TICKET-006: respect "system" preference unless admin passes ?override=true
      // (emergency / safety-critical bulletins).
      const override = new URL(req.url).searchParams.get("override") === "true";
      // Fire-and-forget push fan-out — don't block admin's response on network.
      void sendLockerBroadcastToAllSubmitters({ respectPreference: !override })
        .then((stats) => {
          log.info("push fan-out", {
            delivered: stats.delivered,
            userCount: stats.userCount,
            failed: stats.failed,
            override,
          });
        })
        .catch((err) => {
          log.error("push fan-out crashed", { error: err });
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
        dropOffDate1: row.dropOffDate1?.toISOString() ?? null,
        dropOffDate2: row.dropOffDate2?.toISOString() ?? null,
        dropOffDate3: row.dropOffDate3?.toISOString() ?? null,
        isPublished: row.isPublished,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
