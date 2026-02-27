import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { Prisma } from "@prisma/client";

type ReadType = "likes" | "followers" | "comments" | "all";

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    let readType: ReadType = "all";

    try {
      const body = (await req.json()) as { type?: ReadType };
      if (body?.type && ["likes", "followers", "comments", "all"].includes(body.type)) {
        readType = body.type;
      }
    } catch {
      // Allow empty body for backward compatibility (defaults to all).
    }

    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      isRead: false,
    };
    if (readType === "likes") where.type = "like";
    if (readType === "followers") where.type = "follow";
    if (readType === "comments") where.type = { in: ["comment", "mention"] };

    await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, data: { type: readType } });
  } catch (error) {
    return handleError(error);
  }
}
