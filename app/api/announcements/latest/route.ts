import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser(req);
    const now = new Date();
    const rows = await prisma.globalAnnouncement.findMany({
      where: { isPublished: true },
      orderBy: [{ displayStartAt: "desc" }, { publishedAt: "desc" }],
    });
    const row =
      rows.find(
        (item) =>
          (!item.displayStartAt || item.displayStartAt <= now) &&
          (!item.displayEndAt || item.displayEndAt >= now)
      ) ?? null;
    return NextResponse.json({
      success: true,
      data: row
        ? {
            id: row.id,
            title: row.title,
            content: row.content,
            updatedAt: row.updatedAt,
            publishedAt: row.publishedAt,
          }
        : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
