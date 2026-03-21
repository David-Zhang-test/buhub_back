import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError, NotFoundError, ForbiddenError } from "@/src/lib/errors";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const existing = await prisma.course.findUnique({
      where: { id },
      include: { schedule: { select: { userId: true } } },
    });

    if (!existing) {
      throw new NotFoundError("Course not found");
    }
    if (existing.schedule.userId !== user.id) {
      throw new ForbiddenError("You do not have permission to update this course");
    }

    const body = await req.json();
    const { name, location, dayOfWeek, startTime, endTime, color } = body as {
      name?: string;
      location?: string;
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      color?: string;
    };

    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(location !== undefined && { location }),
        ...(dayOfWeek !== undefined && { dayOfWeek }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(color !== undefined && { color }),
      },
    });

    return NextResponse.json({ success: true, data: course });
  } catch (error) {
    return handleError(error, req);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const existing = await prisma.course.findUnique({
      where: { id },
      include: { schedule: { select: { userId: true } } },
    });

    if (!existing) {
      throw new NotFoundError("Course not found");
    }
    if (existing.schedule.userId !== user.id) {
      throw new ForbiddenError("You do not have permission to delete this course");
    }

    await prisma.course.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return handleError(error, req);
  }
}
