import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import {
  DROP_OFF_DATES,
  PICKUP_DATES,
  RESIDENCE_HALL_GROUPS,
  type ResidenceHallGroupKey,
} from "@/src/schemas/locker-request.schema";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20")), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.LockerRequestWhereInput = {};
    const dropOffDateParam = searchParams.get("dropOffDate");
    if (dropOffDateParam && (DROP_OFF_DATES as readonly string[]).includes(dropOffDateParam)) {
      where.dropOffDate = new Date(`${dropOffDateParam}T00:00:00Z`);
    }
    const pickupDateParam = searchParams.get("pickupDate");
    if (pickupDateParam && (PICKUP_DATES as readonly string[]).includes(pickupDateParam)) {
      where.pickupDate = new Date(`${pickupDateParam}T00:00:00Z`);
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
