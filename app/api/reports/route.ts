import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createReportSchema } from "@/src/schemas/report.schema";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = createReportSchema.parse(body);

    if (data.targetType === "post") {
      const post = await prisma.post.findUnique({
        where: { id: data.targetId },
      });
      if (!post) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
          { status: 404 }
        );
      }
      await prisma.report.create({
        data: {
          reporterId: user.id,
          postId: data.targetId,
          reason: data.reason,
          snapshot: { post, reportedAt: new Date().toISOString() },
        },
      });
    } else if (data.targetType === "comment") {
      const comment = await prisma.comment.findUnique({
        where: { id: data.targetId },
        include: { post: true },
      });
      if (!comment) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Comment not found" } },
          { status: 404 }
        );
      }
      await prisma.report.create({
        data: {
          reporterId: user.id,
          commentId: data.targetId,
          reason: data.reason,
          snapshot: { comment, reportedAt: new Date().toISOString() },
        },
      });
    } else {
      const [partnerPost, errand, secondhand, rating] = await Promise.all([
        prisma.partnerPost.findUnique({ where: { id: data.targetId } }),
        prisma.errand.findUnique({ where: { id: data.targetId } }),
        prisma.secondhandItem.findUnique({ where: { id: data.targetId } }),
        prisma.ratingItem.findUnique({ where: { id: data.targetId } }),
      ]);

      const target =
        partnerPost
          ? { resourceType: "partner", data: partnerPost }
          : errand
            ? { resourceType: "errand", data: errand }
            : secondhand
              ? { resourceType: "secondhand", data: secondhand }
              : rating
                ? { resourceType: "rating", data: rating }
                : null;

      if (!target) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Function resource not found" } },
          { status: 404 }
        );
      }

      await prisma.report.create({
        data: {
          reporterId: user.id,
          reason: data.reason,
          snapshot: {
            targetType: "function",
            targetId: data.targetId,
            ...target,
            reportedAt: new Date().toISOString(),
          },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const where: { status?: string } = {};
    if (status) where.status = status;

    const reports = await prisma.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, nickname: true, email: true } },
        post: { select: { id: true, content: true, authorId: true } },
        comment: { select: { id: true, content: true, authorId: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({ success: true, data: reports });
  } catch (error) {
    return handleError(error);
  }
}
