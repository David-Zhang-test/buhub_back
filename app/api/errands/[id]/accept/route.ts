import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: errandId } = await params;

    const errand = await prisma.errand.findUnique({
      where: { id: errandId },
    });

    if (!errand || errand.expired) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Errand not found or expired" } },
        { status: 404 }
      );
    }
    if (errand.authorId === user.id) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID", message: "Cannot accept your own errand" } },
        { status: 400 }
      );
    }

    const existing = await prisma.errandAccept.findUnique({
      where: { errandId_userId: { errandId, userId: user.id } },
    });

    if (existing) {
      await prisma.errandAccept.delete({
        where: { errandId_userId: { errandId, userId: user.id } },
      });
      return NextResponse.json({ success: true, data: { accepted: false } });
    }

    await prisma.errandAccept.create({
      data: { errandId, userId: user.id },
    });
    return NextResponse.json({ success: true, data: { accepted: true } });
  } catch (error) {
    return handleError(error);
  }
}
