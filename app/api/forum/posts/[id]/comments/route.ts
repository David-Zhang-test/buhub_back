import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createCommentSchema } from "@/src/schemas/comment.schema";

const AUTHOR_SELECT = {
  id: true,
  nickname: true,
  avatar: true,
  gender: true,
  grade: true,
  major: true,
  userName: true,
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const sortBy = searchParams.get("sortBy") || "recent";
    const skip = (page - 1) * limit;

    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    // Optionally get current user for liked status
    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      // Not logged in
    }

    const topLevel = await prisma.comment.findMany({
      where: { postId, parentId: null, isDeleted: false },
      include: {
        author: { select: AUTHOR_SELECT },
      },
      orderBy: sortBy === "popular" ? { likeCount: "desc" } : { createdAt: "asc" },
      skip,
      take: limit,
    });

    const replyIds = topLevel.flatMap((c) => c.id);
    const replies = await prisma.comment.findMany({
      where: { parentId: { in: replyIds }, isDeleted: false },
      include: {
        author: { select: AUTHOR_SELECT },
      },
      orderBy: { createdAt: "asc" },
    });

    // Batch-query user's liked and bookmarked comment IDs
    let likedCommentIds = new Set<string>();
    let bookmarkedCommentIds = new Set<string>();
    if (currentUserId) {
      const allCommentIds = [...topLevel.map((c) => c.id), ...replies.map((r) => r.id)];
      const [userLikes, userBookmarks] = await Promise.all([
        prisma.like.findMany({
          where: { userId: currentUserId, commentId: { in: allCommentIds } },
          select: { commentId: true },
        }),
        prisma.bookmark.findMany({
          where: { userId: currentUserId, commentId: { in: allCommentIds } },
          select: { commentId: true },
        }),
      ]);
      likedCommentIds = new Set(userLikes.map((l) => l.commentId).filter(Boolean) as string[]);
      bookmarkedCommentIds = new Set(userBookmarks.map((b) => b.commentId).filter(Boolean) as string[]);
    }

    const replyMap = new Map<string, typeof replies>();
    for (const r of replies) {
      if (r.parentId) {
        const list = replyMap.get(r.parentId) ?? [];
        list.push(r);
        replyMap.set(r.parentId, list);
      }
    }

    const nested = topLevel.map((c) => ({
      ...c,
      liked: likedCommentIds.has(c.id),
      bookmarked: bookmarkedCommentIds.has(c.id),
      replies: (replyMap.get(c.id) ?? []).map((r) => ({
        ...r,
        liked: likedCommentIds.has(r.id),
        bookmarked: bookmarkedCommentIds.has(r.id),
      })),
    }));

    return NextResponse.json({
      success: true,
      data: nested,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id: postId } = await params;
    const body = await req.json();
    const data = createCommentSchema.parse({ ...body, postId });

    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    if (data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: data.parentId, postId },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Parent comment not found" } },
          { status: 400 }
        );
      }
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId: user.id,
        content: data.content,
        parentId: data.parentId,
      },
      include: {
        author: { select: AUTHOR_SELECT },
      },
    });

    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    const notifyUserId = data.parentId
      ? (await prisma.comment.findUnique({
          where: { id: data.parentId },
          select: { authorId: true },
        }))?.authorId ?? post.authorId
      : post.authorId;

    if (notifyUserId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: notifyUserId,
          type: "comment",
          actorId: user.id,
          postId,
          commentId: comment.id,
        },
      });
    }

    return NextResponse.json({ success: true, data: comment });
  } catch (error) {
    return handleError(error);
  }
}
