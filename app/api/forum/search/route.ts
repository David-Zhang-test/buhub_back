import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { generateAnonymousIdentity } from "@/src/lib/anonymous";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    if (!q || q.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "QUERY_TOO_SHORT", message: "Search query must be at least 2 characters" },
        },
        { status: 400 }
      );
    }

    let blockedUserIds: string[] = [];
    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
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

    const where: { isDeleted: boolean; authorId?: object } = { isDeleted: false };
    if (blockedUserIds.length > 0) {
      where.authorId = { notIn: blockedUserIds };
    }

    const searchTerms = q.split(/\s+/).filter(Boolean);

    const posts = await prisma.post.findMany({
      where: {
        ...where,
        OR: [
          { content: { contains: q, mode: "insensitive" as const } },
          ...(searchTerms.length > 0
            ? [{ tags: { hasSome: searchTerms } }]
            : []),
        ],
      },
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
      orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    });

    const userVotesByPost = new Map<
      string,
      { id: string; optionId: string; createdAt: Date }
    >();
    if (currentUserId && posts.length > 0) {
      const pollPostIds = posts.filter((p) => p.postType === "poll").map((p) => p.id);
      if (pollPostIds.length > 0) {
        const votes = await prisma.vote.findMany({
          where: { postId: { in: pollPostIds }, userId: currentUserId },
          select: { id: true, postId: true, optionId: true, createdAt: true },
        });
        for (const v of votes) {
          userVotesByPost.set(v.postId, {
            id: v.id,
            optionId: v.optionId,
            createdAt: v.createdAt,
          });
        }
      }
    }

    const formatted = posts.map((p) => {
      const vote = p.postType === "poll" ? userVotesByPost.get(p.id) : undefined;
      const anonIdentity = p.isAnonymous ? generateAnonymousIdentity(p.authorId) : null;
      return {
        id: p.id,
        postType: p.postType,
        avatar: p.isAnonymous ? anonIdentity?.avatar : p.author.avatar,
        name: p.isAnonymous ? anonIdentity?.name : p.author.nickname,
        gender: p.isAnonymous ? "other" : p.author.gender,
        meta: p.isAnonymous ? "" : [p.author.grade, p.author.major].filter(Boolean).join(" · "),
        createdAt: p.createdAt.toISOString(),
        content: p.content,
        likes: p.likeCount,
        comments: p.commentCount,
        tags: p.tags,
        isAnonymous: p.isAnonymous,
        pollOptions: p.pollOptions?.map((o) => ({ id: o.id, text: o.text, voteCount: o.voteCount })),
        ...(vote
          ? {
              myVote: {
                id: vote.id,
                optionId: vote.optionId,
                createdAt: vote.createdAt.toISOString(),
              },
            }
          : {}),
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error) {
    return handleError(error);
  }
}
