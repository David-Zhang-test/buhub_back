import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const schedule = await prisma.schedule.findUnique({
      where: { userId: user.id },
      include: {
        courses: {
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
      },
    });

    return NextResponse.json({ success: true, data: schedule });
  } catch (error) {
    return handleError(error, req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const imageUrl =
      typeof body.imageUrl === "string" && body.imageUrl.trim().length > 0
        ? body.imageUrl.trim()
        : null;
    const courses: Array<{
      name: string;
      location?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      color?: string;
    }> = body.courses ?? [];

    const schedule = await prisma.$transaction(async (tx) => {
      const existing = await tx.schedule.findUnique({ where: { userId: user.id } });

      let scheduleId: string;
      if (existing) {
        scheduleId = existing.id;
        await tx.course.deleteMany({ where: { scheduleId } });
        await tx.schedule.update({
          where: { id: scheduleId },
          data: {
            imageUrl: imageUrl ?? existing.imageUrl,
          },
        });
      } else {
        const created = await tx.schedule.create({
          data: {
            userId: user.id,
            ...(imageUrl ? { imageUrl } : {}),
          },
        });
        scheduleId = created.id;
      }

      await tx.course.createMany({
        data: courses.map((c) => ({
          scheduleId,
          name: c.name,
          location: c.location ?? "",
          dayOfWeek: c.dayOfWeek,
          startTime: c.startTime,
          endTime: c.endTime,
          color: c.color ?? "#FFF6D7",
        })),
      });

      return tx.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          courses: {
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
        },
      });
    });

    return NextResponse.json({ success: true, data: schedule });
  } catch (error) {
    return handleError(error, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const existing = await prisma.schedule.findUnique({ where: { userId: user.id } });
    if (existing) {
      await prisma.schedule.delete({ where: { id: existing.id } });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, req);
  }
}
