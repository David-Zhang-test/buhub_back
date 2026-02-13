import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const message = await prisma.directMessage.findUnique({
      where: { id },
    });

    if (!message || message.senderId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Message not found" } },
        { status: 404 }
      );
    }

    await prisma.directMessage.update({
      where: { id },
      data: { isDeleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
