import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { submitRatingSchema } from "@/src/schemas/rating.schema";

const VALID_CATEGORIES = ["COURSE", "TEACHER", "CANTEEN", "MAJOR"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { category, id: itemId } = await params;
    const body = await req.json();
    const data = submitRatingSchema.parse(body);

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CATEGORY", message: "Invalid category" } },
        { status: 400 }
      );
    }

    const item = await prisma.ratingItem.findFirst({
      where: {
        id: itemId,
        category: category as "COURSE" | "TEACHER" | "CANTEEN" | "MAJOR",
      },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 }
      );
    }

    const semester = data.semester ?? null;

    const existing = await prisma.rating.findFirst({
      where: {
        itemId,
        userId: user.id,
        ...(semester ? { semester } : { semester: null }),
      },
    });

    if (existing) {
      await prisma.rating.update({
        where: { id: existing.id },
        data: {
          scores: data.scores as object,
          tags: data.tags,
          comment: data.comment ?? null,
        },
      });
    } else {
      await prisma.rating.create({
        data: {
          itemId,
          userId: user.id,
          scores: data.scores as object,
          tags: data.tags,
          comment: data.comment ?? null,
          semester,
        },
      });
    }

    const updated = await prisma.ratingItem.findUnique({
      where: { id: itemId },
      include: { ratings: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}
