import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createPartnerSchema } from "@/src/schemas/partner.schema";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.toUpperCase() || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const where: { expired?: boolean; category?: "TRAVEL" | "FOOD" | "COURSE" | "SPORTS" | "OTHER" } = { expired: false };
    if (category && ["TRAVEL", "FOOD", "COURSE", "SPORTS", "OTHER"].includes(category)) {
      where.category = category as "TRAVEL" | "FOOD" | "COURSE" | "SPORTS" | "OTHER";
    }

    const posts = await prisma.partnerPost.findMany({
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

    return NextResponse.json({ success: true, data: posts });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = createPartnerSchema.parse(body);

    const post = await prisma.partnerPost.create({
      data: {
        authorId: user.id,
        category: data.category,
        type: data.type,
        title: data.title,
        description: data.description,
        time: data.time,
        location: data.location,
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

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    return handleError(error);
  }
}
