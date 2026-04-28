import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getLockerTimeline } from "@/src/lib/locker-config";
import {
  DROP_OFF_DATES,
  RESIDENCE_HALL_GROUPS,
  type ResidenceHallGroupKey,
} from "@/src/schemas/locker-request.schema";
import type { Prisma } from "@prisma/client";

const DROP_OFF_DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isoToDateOnly(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20")), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.LockerRequestWhereInput = {};
    const dropOffDateParam = searchParams.get("dropOffDate");
    if (dropOffDateParam && DROP_OFF_DATE_PARAM_PATTERN.test(dropOffDateParam)) {
      const timeline = await getLockerTimeline();
      const configuredDates = [
        isoToDateOnly(timeline.dropOffDate1Iso),
        isoToDateOnly(timeline.dropOffDate2Iso),
        isoToDateOnly(timeline.dropOffDate3Iso),
      ].filter((v): v is string => Boolean(v));
      const allowed = configuredDates.length > 0 ? configuredDates : [...DROP_OFF_DATES];
      if (allowed.includes(dropOffDateParam)) {
        where.dropOffDate = new Date(`${dropOffDateParam}T00:00:00Z`);
      }
    }
    const studentIdParam = searchParams.get("studentId")?.trim();
    if (studentIdParam) {
      where.studentId = { contains: studentIdParam, mode: "insensitive" };
    }
    const hallGroupParam = searchParams.get("residenceHallGroup");
    if (hallGroupParam && hallGroupParam in RESIDENCE_HALL_GROUPS) {
      where.residenceAddress = {
        in: [...RESIDENCE_HALL_GROUPS[hallGroupParam as ResidenceHallGroupKey]],
      };
    }
    const boxCountParam = searchParams.get("boxCount");
    if (boxCountParam) {
      const n = Number.parseInt(boxCountParam, 10);
      if (Number.isInteger(n) && n >= 1 && n <= 10) {
        where.boxCount = n;
      }
    }

    const [rows, total] = await Promise.all([
      prisma.lockerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      prisma.lockerRequest.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: rows, total });
  } catch (error) {
    return handleError(error);
  }
}
