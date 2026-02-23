import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";
import { createPostSchema } from "@/src/schemas/post.schema";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const sortBy = searchParams.get("sortBy") || "recent";
    const category = searchParams.get("category") || undefined;
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
        await redis.setex(cacheKey, 300, JSON.stringify(blockedUserIds));
      }
    } catch {
      // Not logged in - no blocked list
    }

    const where: { isDeleted: boolean; authorId?: object; category?: string } = {
      isDeleted: false,
    };
    if (blockedUserIds.length > 0) {
      where.authorId = { notIn: blockedUserIds };
    }
    if (category) where.category = category;

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
      orderBy:
        sortBy === "popular"
          ? [{ likeCount: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
    });

    // Fetch user's Vote records for poll posts (when logged in)
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
      return {
        id: p.id,
        postType: p.postType,
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

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = createPostSchema.parse(body);

    if (data.postType === "poll" && (!data.pollOptions || data.pollOptions.length < 2)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_POLL", message: "Poll requires 2-10 options" } },
        { status: 400 }
      );
    }

    const post = await prisma.post.create({
      data: {
        authorId: user.id,
        postType: data.postType,
        content: data.content,
        images: data.images ?? [],
        tags: data.tags ?? [],
        category: data.category ?? "forum",
        isAnonymous: data.isAnonymous ?? false,
        pollEndDate: data.pollEndDate ? new Date(data.pollEndDate) : null,
        partnerType: data.partnerType,
        eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
        price: data.price,
        errandType: data.errandType,
        startAddress: data.startAddress,
        endAddress: data.endAddress,
        taskEndTime: data.taskEndTime ? new Date(data.taskEndTime) : null,
        itemPrice: data.itemPrice,
        itemLocation: data.itemLocation,
        saleEndTime: data.saleEndTime ? new Date(data.saleEndTime) : null,
        pollOptions:
          data.postType === "poll" && data.pollOptions
            ? { create: data.pollOptions.map((text) => ({ text })) }
            : undefined,
      },
      include: {
        author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true } },
        pollOptions: true,
      },
    });

    if (data.tags && data.tags.length > 0) {
      for (const name of data.tags) {
        await prisma.tag.upsert({
          where: { name },
          create: { name, usageCount: 1 },
          update: { usageCount: { increment: 1 } },
        });
      }
    }

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    return handleError(error);
  }
}
