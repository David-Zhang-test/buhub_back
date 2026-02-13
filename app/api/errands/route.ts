import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createErrandSchema } from "@/src/schemas/errand.schema";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const where: { expired?: boolean; category?: "PICKUP" | "BUY" | "OTHER" } = { expired: false };
    if (category && ["PICKUP", "BUY", "OTHER"].includes(category)) {
      where.category = category as "PICKUP" | "BUY" | "OTHER";
    }

    const errands = await prisma.errand.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            userName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({ success: true, data: errands });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = createErrandSchema.parse(body);

    const errand = await prisma.errand.create({
      data: {
        authorId: user.id,
        category: data.category,
        type: data.type,
        title: data.title,
        description: data.description,
        from: data.from,
        to: data.to,
        price: data.price,
        item: data.item,
        time: data.time,
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
            userName: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: errand });
  } catch (error) {
    return handleError(error);
  }
}
