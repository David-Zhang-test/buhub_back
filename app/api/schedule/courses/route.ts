import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { name, location, dayOfWeek, startTime, endTime, color } = body as {
      name: string;
      location?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      color?: string;
    };

    if (!name || dayOfWeek == null || !startTime || !endTime) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "name, dayOfWeek, startTime, and endTime are required" } },
        { status: 400 }
      );
    }

    const schedule = await prisma.schedule.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    const course = await prisma.course.create({
      data: {
        scheduleId: schedule.id,
        name,
        location: location ?? "",
        dayOfWeek,
        startTime,
        endTime,
        color: color ?? "#FFF6D7",
      },
    });

    return NextResponse.json({ success: true, data: course });
  } catch (error) {
    return handleError(error, req);
  }
}
