import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const { tag } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    let blockedUserIds: string[] = [];
    try {
      const { user } = await getCurrentUser(req);
      const cacheKey = `user:${user.id}:blocked`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        blockedUserIds = JSON.parse(cached);
      } else {
        const blocked = await prisma.block.findMany({
          where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
          select: { blockedId: true, blockerId: true },
        });
        blockedUserIds = [
          ...blocked.filter((b) => b.blockerId === user.id).map((b) => b.blockedId),
          ...blocked.filter((b) => b.blockedId === user.id).map((b) => b.blockerId),
        ];
      }
    } catch {
      /* not logged in */
    }

    const where: {
      isDeleted: boolean;
      tags: { has: string };
      authorId?: { notIn: string[] };
    } = {
      isDeleted: false,
      tags: { has: decodeURIComponent(tag) },
    };
    if (blockedUserIds.length > 0) {
      where.authorId = { notIn: blockedUserIds };
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
        pollOptions: true,
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const formatted = posts.map((p) => ({
      id: p.id,
      avatar: p.isAnonymous ? null : p.author.avatar,
      name: p.isAnonymous ? "匿名用户" : p.author.nickname,
      gender: p.isAnonymous ? "other" : p.author.gender,
      meta: p.isAnonymous ? "" : [p.author.grade, p.author.major].filter(Boolean).join(" · "),
      createdAt: p.createdAt.toISOString(),
      lang: "en",
      content: p.content,
      likes: p.likeCount,
      comments: p.commentCount,
      tags: p.tags,
      isAnonymous: p.isAnonymous,
      pollOptions: p.pollOptions?.map((o) => ({ id: o.id, text: o.text, voteCount: o.voteCount })),
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (error) {
    return handleError(error);
  }
}
