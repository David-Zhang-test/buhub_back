import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createSecondhandSchema } from "@/src/schemas/secondhand.schema";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.toUpperCase() || undefined;
    const sold = searchParams.get("sold");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const where: { expired?: boolean; category?: "ELECTRONICS" | "BOOKS" | "FURNITURE" | "OTHER"; sold?: boolean } = { expired: false };
    if (category && ["ELECTRONICS", "BOOKS", "FURNITURE", "OTHER"].includes(category)) {
      where.category = category as "ELECTRONICS" | "BOOKS" | "FURNITURE" | "OTHER";
    }
    if (sold === "true") where.sold = true;
    if (sold === "false") where.sold = false;

    const items = await prisma.secondhandItem.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = createSecondhandSchema.parse(body);

    const item = await prisma.secondhandItem.create({
      data: {
        authorId: user.id,
        category: data.category,
        type: data.type,
        title: data.title,
        description: data.description,
        price: data.price,
        condition: data.condition,
        location: data.location,
        images: data.images ?? [],
        expiresAt: new Date(data.expiresAt),
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    return handleError(error);
  }
}
