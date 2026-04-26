import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError, NotFoundError } from "@/src/lib/errors";
import { updateLockerRequestStatusSchema } from "@/src/schemas/locker-request.schema";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "ADMIN");
    const { id } = await params;

    const existing = await prisma.lockerRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Locker request not found");
    }

    await prisma.lockerRequest.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "ADMIN");
    const { id } = await params;
    const body = await req.json();
    const data = updateLockerRequestStatusSchema.parse(body);

    const existing = await prisma.lockerRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Locker request not found");
    }

    const updated = await prisma.lockerRequest.update({
      where: { id },
      data: { status: data.status },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}
