import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getErrorMessage } from "@/src/lib/errorMessages";
import { updateFeedbackStatusSchema } from "@/src/schemas/feedback.schema";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["REPLIED", "RESOLVED"],
  REPLIED: ["RESOLVED"],
  RESOLVED: [],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "ADMIN");
    const { id } = await params;
    const body = await req.json();
    const data = updateFeedbackStatusSchema.parse(body);

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!feedback) {
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

    if (!VALID_TRANSITIONS[feedback.status]?.includes(data.status)) {
      const lang = req.headers.get("x-lang") || "en";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATUS_TRANSITION",
            message: getErrorMessage("INVALID_STATUS_TRANSITION", lang),
          },
        },
        { status: 400 }
      );
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: { status: data.status },
      select: { id: true, status: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "ADMIN");
    const { id } = await params;

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!feedback) {
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

    await prisma.feedback.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
