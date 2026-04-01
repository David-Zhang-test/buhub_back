import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createFeedbackSchema } from "@/src/schemas/feedback.schema";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = createFeedbackSchema.parse(body);

    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        category: data.category,
        description: data.description,
        imageUrls: data.imageUrls,
      },
    });

    return NextResponse.json(
      { success: true, data: { id: feedback.id } },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20")), 50);
    const skip = (page - 1) * limit;

    const where = { userId: user.id };

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        select: {
          id: true,
          category: true,
          description: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    const data = feedbacks.map((f) => ({
      ...f,
      description:
        f.description.length > 100
          ? f.description.slice(0, 100) + "..."
          : f.description,
    }));

    return NextResponse.json({ success: true, data, total });
  } catch (error) {
    return handleError(error);
  }
}
