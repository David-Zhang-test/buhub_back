import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveRequestLanguage } from "@/src/lib/language";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const appLanguage = resolveRequestLanguage(req.headers);
    const { tag } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

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

    const posts: any[] = await prisma.post.findMany({
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

    const formatted = posts.map((post) => {
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
        gender: post.isAnonymous ? "other" : post.author.gender,
        meta: post.isAnonymous ? "" : [post.author.grade, post.author.major].filter(Boolean).join(" 路 "),
        createdAt: post.createdAt.toISOString(),
        lang: "en",
        content: post.content,
        likes: post.likeCount,
        comments: post.commentCount,
        tags: post.tags,
        isAnonymous: post.isAnonymous,
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
