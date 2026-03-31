import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getErrorMessage } from "@/src/lib/errorMessages";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: {
        replies: {
          include: {
            admin: {
              select: { id: true, nickname: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!feedback || feedback.userId !== user.id) {
      const lang = req.headers.get("x-lang") || "en";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FEEDBACK_NOT_FOUND",
            message: getErrorMessage("FEEDBACK_NOT_FOUND", lang),
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    return handleError(error);
  }
}
