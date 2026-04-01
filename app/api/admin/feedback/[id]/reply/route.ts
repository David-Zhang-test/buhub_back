import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getErrorMessage } from "@/src/lib/errorMessages";
import { adminReplySchema } from "@/src/schemas/feedback.schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireRole(req, "ADMIN");
    const { id } = await params;
    const body = await req.json();
    const data = adminReplySchema.parse(body);

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

    const [reply] = await prisma.$transaction([
      prisma.feedbackReply.create({
        data: {
          feedbackId: id,
          adminId: admin.id,
          content: data.content,
        },
        include: {
          admin: {
            select: { id: true, nickname: true },
          },
        },
      }),
      // Only update to REPLIED if currently PENDING (idempotent)
      prisma.feedback.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "REPLIED" },
      }),
    ]);

    return NextResponse.json({ success: true, data: reply }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
