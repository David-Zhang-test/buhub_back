import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { sendSystemAnnouncementToAllUsers } from "@/src/services/expo-push.service";
import { child } from "@/src/lib/logger";

const log = child("announcement");

const publishSchema = z.object({
  action: z.literal("publish"),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(5000),
  pushBody: z.string().trim().min(1).max(240),
  displayStartAt: z.string().datetime().nullable().optional(),
  displayEndAt: z.string().datetime().nullable().optional(),
  notifyAllUsers: z.boolean().optional(),
});

const withdrawSchema = z.object({
  action: z.literal("withdraw"),
  id: z.string().min(1),
});

type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  pushBody: string | null;
  displayStartAt: Date | null;
  displayEndAt: Date | null;
  isPublished: boolean;
  updatedAt: Date;
  publishedAt: Date | null;
};

function getEffectiveStartAt(row: AnnouncementRow): Date {
  return row.displayStartAt ?? row.publishedAt ?? row.updatedAt;
}

function isCurrent(row: AnnouncementRow, now: Date): boolean {
  const start = getEffectiveStartAt(row);
  const end = row.displayEndAt;
  return row.isPublished && start <= now && (!end || end >= now);
}

function isQueued(row: AnnouncementRow, now: Date): boolean {
  const start = getEffectiveStartAt(row);
  return row.isPublished && start > now;
}

function isHistory(row: AnnouncementRow, now: Date): boolean {
  return !isCurrent(row, now) && !isQueued(row, now);
}

function windowsOverlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  const aEndMs = aEnd ? aEnd.getTime() : Number.POSITIVE_INFINITY;
  const bEndMs = bEnd ? bEnd.getTime() : Number.POSITIVE_INFINITY;
  return aStart.getTime() <= bEndMs && bStart.getTime() <= aEndMs;
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");
    const rows = await prisma.globalAnnouncement.findMany({
      orderBy: { publishedAt: "desc" },
    });
    const now = new Date();
    const current = rows.find((row) => isCurrent(row, now)) ?? null;
    const history = rows
      .filter((row) => isHistory(row, now) || isQueued(row, now))
      .sort((a, b) => {
        const aTime = (a.displayEndAt ?? a.updatedAt).getTime();
        const bTime = (b.displayEndAt ?? b.updatedAt).getTime();
        return bTime - aTime;
      });

    return NextResponse.json({
      success: true,
      data: {
        currentAnnouncement: current,
        historyAnnouncements: history,
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
    const action = body?.action;

    if (action === "withdraw") {
      const payload = withdrawSchema.parse(body);
      const target = await prisma.globalAnnouncement.findUnique({
        where: { id: payload.id },
      });
      if (!target) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Announcement not found." },
          },
          { status: 404 }
        );
      }
      const now = new Date();
      if (!isCurrent(target, now)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Only the current announcement can be withdrawn.",
            },
          },
          { status: 400 }
        );
      }

      await prisma.globalAnnouncement.update({
        where: { id: payload.id },
        data: { isPublished: false },
      });
      return NextResponse.json({ success: true, data: { id: payload.id, withdrawn: true } });
    }

    const {
      title,
      content,
      pushBody,
      displayStartAt,
      displayEndAt,
      notifyAllUsers,
    } = publishSchema.parse(body);

    if (
      displayStartAt &&
      displayEndAt &&
      Date.parse(displayStartAt) >= Date.parse(displayEndAt)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Display start time must be earlier than display end time.",
          },
        },
        { status: 400 }
      );
    }

    const nextStart = displayStartAt ? new Date(displayStartAt) : new Date();
    const nextEnd = displayEndAt ? new Date(displayEndAt) : null;
    const now = new Date();
    if (nextStart.getTime() > now.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Global announcement publish time cannot be in the future.",
          },
        },
        { status: 400 }
      );
    }
    const publishedRows = await prisma.globalAnnouncement.findMany({
      where: { isPublished: true },
      orderBy: { updatedAt: "desc" },
    });

    const conflicting = publishedRows.find((row) => {
      const rowStart = getEffectiveStartAt(row);
      return windowsOverlap(rowStart, row.displayEndAt, nextStart, nextEnd);
    });
    if (conflicting) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Announcement schedule overlaps with an existing published announcement. Only one can be visible at a time.",
          },
        },
        { status: 400 }
      );
    }

    if (publishedRows.length > 0) {
      await prisma.globalAnnouncement.updateMany({
        where: { isPublished: true },
        data: { isPublished: false },
      });
    }

    const row = await prisma.globalAnnouncement.create({
      data: {
        id: crypto.randomUUID(),
        title,
        content,
        pushBody,
        displayStartAt: displayStartAt ? new Date(displayStartAt) : null,
        displayEndAt: displayEndAt ? new Date(displayEndAt) : null,
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    if (notifyAllUsers) {
      // TICKET-006: respect "system" preference unless admin passes ?override=true.
      const override = new URL(req.url).searchParams.get("override") === "true";
      void sendSystemAnnouncementToAllUsers({
        title: row.title,
        body: row.pushBody?.trim() || row.title,
        respectPreference: !override,
      }).catch((err) => {
        log.error("push fan-out crashed", { error: err });
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        content: row.content,
        pushBody: row.pushBody ?? "",
        displayStartAt: row.displayStartAt?.toISOString() ?? null,
        displayEndAt: row.displayEndAt?.toISOString() ?? null,
        isPublished: row.isPublished,
        updatedAt: row.updatedAt,
        publishedAt: row.publishedAt,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
