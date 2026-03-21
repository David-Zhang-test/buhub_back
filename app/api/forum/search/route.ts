import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveRequestLanguage } from "@/src/lib/language";
import { parseFunctionRef, resolveFunctionRefPreviews } from "@/src/lib/function-ref";

export async function GET(req: NextRequest) {
  try {
    const appLanguage = resolveRequestLanguage(req.headers);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    if (!q) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "QUERY_TOO_SHORT", message: "Search query must be at least 1 character" },
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
      currentUserId = null;
    }

    const where: { isDeleted: boolean; authorId?: object } = { isDeleted: false };
    if (blockedUserIds.length > 0) {
      where.authorId = { notIn: blockedUserIds };
    }

    const searchTerms = q.split(/\s+/).filter(Boolean);

    const posts: any[] = await prisma.post.findMany({
      where: {
        ...where,
        OR: [
          { content: { contains: q, mode: "insensitive" as const } },
          ...(searchTerms.length > 0 ? [{ tags: { hasSome: searchTerms } }] : []),
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
    } as any);

    const userVotesByPost = new Map<string, { id: string; optionId: string; createdAt: Date }>();
    if (currentUserId && posts.length > 0) {
      const pollPostIds = posts.filter((post) => post.postType === "poll").map((post) => post.id);
      if (pollPostIds.length > 0) {
        const votes = await prisma.vote.findMany({
          where: { postId: { in: pollPostIds }, userId: currentUserId },
          select: { id: true, postId: true, optionId: true, createdAt: true },
        });
        for (const vote of votes) {
          userVotesByPost.set(vote.postId, {
            id: vote.id,
            optionId: vote.optionId,
            createdAt: vote.createdAt,
          });
        }
      }
    }

    const parsedRefsByPostId = new Map(
      posts.map((post) => [post.id, parseFunctionRef(post.content).ref]),
    );
    const previewsByEntity = await resolveFunctionRefPreviews(
      Array.from(parsedRefsByPostId.values()).filter((ref): ref is NonNullable<typeof ref> => Boolean(ref)),
    );

    const formatted = posts.map((post) => {
      const ref = parsedRefsByPostId.get(post.id);
      const vote = post.postType === "poll" ? userVotesByPost.get(post.id) : undefined;
      const anonIdentity = post.isAnonymous
        ? resolveAnonymousIdentity(
            {
              anonymousName: post.anonymousName,
              anonymousAvatar: post.anonymousAvatar,
              authorId: post.authorId,
            },
            appLanguage
          )
        : null;

      return {
        id: post.id,
        postType: post.postType,
        avatar: post.isAnonymous ? anonIdentity?.avatar : post.author.avatar,
        name: post.isAnonymous ? anonIdentity?.name : post.author.nickname,
        userName: post.isAnonymous ? null : post.author.userName,
        gender: post.isAnonymous ? "other" : post.author.gender,
        meta: post.isAnonymous ? "" : [post.author.grade, post.author.major].filter(Boolean).join(" 路 "),
        createdAt: post.createdAt.toISOString(),
        sourceLanguage: post.sourceLanguage,
        content: post.content,
        likes: post.likeCount,
        comments: post.commentCount,
        tags: post.tags,
        images: Array.isArray(post.images) ? post.images : [],
        image: Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : null,
        hasImage: Array.isArray(post.images) && post.images.length > 0,
        isAnonymous: post.isAnonymous,
        functionRefPreview: ref ? previewsByEntity.get(`${ref.type}:${ref.id}`) : undefined,
        pollOptions: post.pollOptions?.map((option: any) => ({
          id: option.id,
          text: option.text,
          voteCount: option.voteCount,
        })),
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
