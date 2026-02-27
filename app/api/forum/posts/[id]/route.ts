import { NextRequest, NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";
import { updatePostSchema } from "@/src/schemas/post.schema";
import { generateAnonymousIdentity } from "@/src/lib/anonymous";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.post.findFirst({
      where: { id, isDeleted: false },
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
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        originalPost: {
          select: {
            id: true,
            content: true,
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
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    let liked = false;
    let bookmarked = false;
    try {
      const { user } = await getCurrentUser(req);

      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: user.id, blockedId: post.authorId },
            { blockerId: post.authorId, blockedId: user.id },
          ],
        },
      });
      if (blocked) {
        return NextResponse.json(
          { success: false, error: { code: "BLOCKED", message: "Cannot view this post" } },
          { status: 403 }
        );
      }

      const [likeRecord, bookmarkRecord, voteRecord] = await Promise.all([
        prisma.like.findFirst({ where: { userId: user.id, postId: id } }),
        prisma.bookmark.findUnique({
          where: { userId_postId: { userId: user.id, postId: id } },
        }),
        post.postType === "poll"
          ? prisma.vote.findUnique({
              where: { postId_userId: { postId: id, userId: user.id } },
              select: { id: true, optionId: true, createdAt: true },
            })
          : Promise.resolve(null),
      ]);
      liked = !!likeRecord;
      bookmarked = !!bookmarkRecord;

      await redis.incr(`post:views:${id}`);

      const anonIdentity = post.isAnonymous ? generateAnonymousIdentity(post.authorId) : null;

      // Handle quoted post
      let quotedPost = null;
      if (post.originalPost) {
        const quotedAnonIdentity = post.originalPost.isAnonymous
          ? generateAnonymousIdentity(post.originalPost.author.id)
          : null;
        quotedPost = {
          id: post.originalPost.id,
          content: post.originalPost.content,
          name: post.originalPost.isAnonymous
            ? (quotedAnonIdentity?.name || "匿名用户")
            : post.originalPost.author?.nickname,
          avatar: post.originalPost.isAnonymous
            ? quotedAnonIdentity?.avatar
            : post.originalPost.author?.avatar,
          gender: post.originalPost.isAnonymous ? "other" : post.originalPost.author?.gender,
          createdAt: post.originalPost.createdAt.toISOString(),
          isAnonymous: post.originalPost.isAnonymous,
        };
      }

      return NextResponse.json({
        success: true,
        data: {
          ...post,
          author: post.isAnonymous
            ? { nickname: anonIdentity?.name || "匿名用户", avatar: anonIdentity?.avatar || null, gender: "other", grade: null, major: null }
            : post.author,
          quotedPost,
          liked,
          bookmarked,
          ...(voteRecord
            ? {
                myVote: {
                  id: voteRecord.id,
                  optionId: voteRecord.optionId,
                  createdAt: voteRecord.createdAt.toISOString(),
                },
              }
            : {}),
        },
      });
    } catch {
      // Not logged in
    }

    await redis.incr(`post:views:${id}`);

    const anonIdentity2 = post.isAnonymous ? generateAnonymousIdentity(post.authorId) : null;

    // Handle quoted post
    let quotedPost2 = null;
    if (post.originalPost) {
      const quotedAnonIdentity = post.originalPost.isAnonymous
        ? generateAnonymousIdentity(post.originalPost.author.id)
        : null;
      quotedPost2 = {
        id: post.originalPost.id,
        content: post.originalPost.content,
        name: post.originalPost.isAnonymous
          ? (quotedAnonIdentity?.name || "匿名用户")
          : post.originalPost.author?.nickname,
        avatar: post.originalPost.isAnonymous
          ? quotedAnonIdentity?.avatar
          : post.originalPost.author?.avatar,
        gender: post.originalPost.isAnonymous ? "other" : post.originalPost.author?.gender,
        createdAt: post.originalPost.createdAt.toISOString(),
        isAnonymous: post.originalPost.isAnonymous,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        ...post,
        author: post.isAnonymous
          ? { nickname: anonIdentity2?.name || "匿名用户", avatar: anonIdentity2?.avatar || null, gender: "other", grade: null, major: null }
          : post.author,
        quotedPost: quotedPost2,
        liked: false,
        bookmarked: false,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;
    const body = await req.json();
    const data = updatePostSchema.parse(body);

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    if (post.authorId !== user.id && user.role !== "ADMIN" && user.role !== "MODERATOR") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized to edit" } },
        { status: 403 }
      );
    }

    await prisma.post.update({
      where: { id },
      data: {
        ...(data.content !== undefined && {
          content: DOMPurify.sanitize(data.content, { ALLOWED_TAGS: [] }),
        }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR";
    if (post.authorId !== user.id && !isAdminOrMod) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized to delete" } },
        { status: 403 }
      );
    }

    // Delete the post (soft delete) and all associated comments
    await prisma.$transaction([
      prisma.comment.updateMany({
        where: { postId: id },
        data: { isDeleted: true },
      }),
      prisma.post.update({
        where: { id },
        data: { isDeleted: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
