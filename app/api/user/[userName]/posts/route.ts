import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getCurrentUser } from "@/src/lib/auth";
import { findUserByHandle } from "@/src/services/user.service";
import { handleError } from "@/src/lib/errors";
import { checkCustomRateLimit } from "@/src/lib/rate-limit";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveRequestLanguage } from "@/src/lib/language";
import { parseFunctionRef, resolveFunctionRefPreviews } from "@/src/lib/function-ref";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userName: string }> }
) {
  try {
    const { userName } = await params;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = await checkCustomRateLimit(`rl:user:posts:${clientIp}`, 60_000, 60);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 }
      );
    }

    const targetUser = await findUserByHandle(userName);

    const appLanguage = resolveRequestLanguage(req.headers);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      // Not logged in
    }

    if (currentUserId) {
      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: currentUserId, blockedId: targetUser.id },
            { blockerId: targetUser.id, blockedId: currentUserId },
          ],
        },
      });
      if (blocked) {
        return NextResponse.json(
          { success: false, error: { code: "BLOCKED", message: "Cannot view this profile" } },
          { status: 403 }
        );
      }
    }

    // Enforce profile visibility on the posts feed only. Header/follow/chat
    // remain accessible regardless of visibility. Owner always sees own posts.
    const isOwner = currentUserId === targetUser.id;
    if (!isOwner) {
      if (targetUser.profileVisibility === "HIDDEN") {
        return NextResponse.json(
          { success: false, error: { code: "PROFILE_HIDDEN", message: "This user's page is private" } },
          { status: 403 }
        );
      }
      if (targetUser.profileVisibility === "MUTUAL") {
        if (!currentUserId) {
          return NextResponse.json(
            { success: false, error: { code: "PROFILE_HIDDEN", message: "This user's page is private" } },
            { status: 403 }
          );
        }
        const mutualEdges = await prisma.follow.findMany({
          where: {
            OR: [
              { followerId: currentUserId, followingId: targetUser.id },
              { followerId: targetUser.id, followingId: currentUserId },
            ],
          },
          select: { followerId: true, followingId: true },
        });
        const iFollowThem = mutualEdges.some(
          (e) => e.followerId === currentUserId && e.followingId === targetUser.id
        );
        const theyFollowMe = mutualEdges.some(
          (e) => e.followerId === targetUser.id && e.followingId === currentUserId
        );
        if (!iFollowThem || !theyFollowMe) {
          return NextResponse.json(
            { success: false, error: { code: "PROFILE_HIDDEN", message: "This user's page is private" } },
            { status: 403 }
          );
        }
      }
    }

    const posts: any[] = await prisma.post.findMany({
      where: { authorId: targetUser.id, isDeleted: false, isAnonymous: false },
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
        pollOptions: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        originalPost: {
          select: {
            id: true,
            sourceLanguage: true,
            content: true,
            anonymousName: true,
            anonymousAvatar: true,
            author: {
              select: {
                id: true,
                nickname: true,
                avatar: true,
                gender: true,
                grade: true,
                major: true,
              },
            },
            createdAt: true,
            isAnonymous: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    } as any);

    let likedPostIds = new Set<string>();
    let bookmarkedPostIds = new Set<string>();
    const userVotesByPost = new Map<string, { id: string; optionId: string; createdAt: Date }>();
    if (currentUserId && posts.length > 0) {
      const postIds = posts.map((p) => p.id);
      const pollPostIds = posts.filter((p) => p.postType === "poll").map((p) => p.id);
      const [likes, bookmarks, votes] = await Promise.all([
        prisma.like.findMany({
          where: { userId: currentUserId, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.bookmark.findMany({
          where: { userId: currentUserId, postId: { in: postIds } },
          select: { postId: true },
        }),
        pollPostIds.length > 0
          ? prisma.vote.findMany({
              where: { postId: { in: pollPostIds }, userId: currentUserId },
              select: { id: true, postId: true, optionId: true, createdAt: true },
            })
          : Promise.resolve([]),
      ]);
      likedPostIds = new Set(likes.map((l) => l.postId).filter(Boolean) as string[]);
      bookmarkedPostIds = new Set(bookmarks.map((b) => b.postId).filter(Boolean) as string[]);
      for (const vote of votes) {
        userVotesByPost.set(vote.postId, {
          id: vote.id,
          optionId: vote.optionId,
          createdAt: vote.createdAt,
        });
      }
    }

    const parsedRefsByPostId = new Map(
      posts.map((post) => [post.id, parseFunctionRef(post.content).ref]),
    );
    const previewsByEntity = await resolveFunctionRefPreviews(
      Array.from(parsedRefsByPostId.values()).filter((ref): ref is NonNullable<typeof ref> => Boolean(ref)),
    );

    const hydrated = posts.map((post) => {
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

      let quotedPost = null;
      if (post.originalPost) {
        const quotedAnonIdentity = post.originalPost.isAnonymous
          ? resolveAnonymousIdentity(
              {
                anonymousName: post.originalPost.anonymousName,
                anonymousAvatar: post.originalPost.anonymousAvatar,
                authorId: post.originalPost.author.id,
              },
              appLanguage
            )
          : null;

        quotedPost = {
          id: post.originalPost.id,
          sourceLanguage: post.originalPost.sourceLanguage,
          content: post.originalPost.content,
          name: post.originalPost.isAnonymous ? quotedAnonIdentity?.name : post.originalPost.author?.nickname,
          avatar: post.originalPost.isAnonymous ? quotedAnonIdentity?.avatar : post.originalPost.author?.avatar,
          gender: post.originalPost.isAnonymous ? "other" : post.originalPost.author?.gender,
          createdAt: post.originalPost.createdAt.toISOString(),
          isAnonymous: post.originalPost.isAnonymous,
        };
      }

      return {
        id: post.id,
        postType: post.postType,
        userName: post.author.userName ?? post.author.nickname,
        avatar: post.isAnonymous ? anonIdentity?.avatar : post.author.avatar,
        name: post.isAnonymous ? anonIdentity?.name : post.author.nickname,
        gender: post.isAnonymous ? "other" : post.author.gender,
        gradeKey: post.isAnonymous ? undefined : post.author.grade,
        majorKey: post.isAnonymous ? undefined : post.author.major,
        meta: post.isAnonymous ? "" : [post.author.grade, post.author.major].filter(Boolean).join(" · "),
        createdAt: post.createdAt.toISOString(),
        lang: post.sourceLanguage,
        sourceLanguage: post.sourceLanguage,
        content: post.content,
        images: post.images,
        hasImage: post.images.length > 0,
        image: post.images[0],
        likes: post.likeCount,
        comments: post.commentCount,
        tags: post.tags,
        isAnonymous: post.isAnonymous,
        pollOptions: post.pollOptions?.map((option: any) => ({
          id: option.id,
          text: option.text,
          voteCount: option.voteCount,
        })),
        liked: likedPostIds.has(post.id),
        bookmarked: bookmarkedPostIds.has(post.id),
        quotedPost,
        functionRefPreview: ref ? previewsByEntity.get(`${ref.type}:${ref.id}`) : undefined,
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

    return NextResponse.json({
      success: true,
      data: { posts: hydrated, page, hasMore: hydrated.length === limit },
    });
  } catch (error) {
    return handleError(error);
  }
}
