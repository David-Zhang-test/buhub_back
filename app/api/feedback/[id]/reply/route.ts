import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { getErrorMessage } from "@/src/lib/errorMessages";
import { feedbackReplySchema } from "@/src/schemas/feedback.schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;
    const body = await req.json();
    const data = feedbackReplySchema.parse(body);

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: {
        replies: true,
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

    if (feedback.status === "CLOSED") {
      const lang = req.headers.get("x-lang") || "en";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FEEDBACK_CLOSED",
            message: getErrorMessage("FEEDBACK_CLOSED", lang) || "This ticket is closed.",
          },
        },
        { status: 403 }
      );
    }

    const hasAdminReplied = feedback.replies.some((reply) => reply.isAdmin);
    
    if (!hasAdminReplied) {
      const userRepliesCount = feedback.replies.filter((reply) => !reply.isAdmin).length;
      if (userRepliesCount >= 3) {
        const lang = req.headers.get("x-lang") || "en";
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FEEDBACK_REPLY_LIMIT_REACHED",
              message: getErrorMessage("FEEDBACK_REPLY_LIMIT_REACHED", lang),
            },
          },
          { status: 403 }
        );
      }
    }

    const [reply] = await prisma.$transaction([
      prisma.feedbackReply.create({
        data: {
          feedbackId: id,
          userId: user.id,
          isAdmin: false,
          content: data.content,
        },
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true },
          },
        },
      }),
      // Automatically re-open the ticket if it was resolved
      prisma.feedback.update({
        where: { id },
        data: { status: "UNRESOLVED" },
      }),
    ]);

    return NextResponse.json({ success: true, data: reply }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
