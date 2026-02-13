import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const voteSchema = z.object({ optionId: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: postId } = await params;
    const body = await req.json();
    const { optionId } = voteSchema.parse(body);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { pollOptions: true },
    });

    if (!post || post.postType !== "poll") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_A_POLL", message: "This post is not a poll" } },
        { status: 400 }
      );
    }

    const option = post.pollOptions.find((o) => o.id === optionId);
    if (!option) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_OPTION", message: "Option does not exist" } },
        { status: 400 }
      );
    }

    if (post.pollEndDate && new Date() > post.pollEndDate) {
      return NextResponse.json(
        { success: false, error: { code: "POLL_ENDED", message: "Poll has ended" } },
        { status: 400 }
      );
    }

    const existingVote = await prisma.vote.findUnique({
      where: {
        postId_userId: { postId, userId: user.id },
      },
    });

    if (existingVote) {
      if (existingVote.optionId === optionId) {
        return NextResponse.json({
          success: true,
          data: { optionId, voteCount: option.voteCount },
        });
      }
      await prisma.$transaction([
        prisma.pollOption.update({
          where: { id: existingVote.optionId },
          data: { voteCount: { decrement: 1 } },
        }),
        prisma.pollOption.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } },
        }),
        prisma.vote.update({
          where: { postId_userId: { postId, userId: user.id } },
          data: { optionId },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.vote.create({
          data: { postId, userId: user.id, optionId },
        }),
        prisma.pollOption.update({
          where: { id: optionId },
          data: { voteCount: { increment: 1 } },
        }),
      ]);
    }

    const updated = await prisma.pollOption.findUnique({
      where: { id: optionId },
    });

    return NextResponse.json({
      success: true,
      data: {
        optionId,
        voteCount: updated?.voteCount ?? option.voteCount + 1,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
