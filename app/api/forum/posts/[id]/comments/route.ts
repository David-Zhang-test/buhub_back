import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createCommentSchema } from "@/src/schemas/comment.schema";
import { generateAnonymousIdentity } from "@/src/lib/anonymous";

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

    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      // Not logged in
    }

    // Get all comments for this post (including all nested levels)
    const allComments = await prisma.comment.findMany({
      where: { postId, isDeleted: false },
      include: {
        author: { select: AUTHOR_SELECT },
        likes: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Separate top-level comments (parentId = null) from replies
    const topLevel = allComments.filter((c) => c.parentId === null);
    const replies = allComments.filter((c) => c.parentId !== null);

    // Apply pagination to top-level only
    const paginatedTopLevel = topLevel.slice(skip, skip + limit);

    let likedCommentIds = new Set<string>();
    let bookmarkedCommentIds = new Set<string>();
    if (currentUserId) {
      const allCommentIds = [...topLevel.map((c) => c.id), ...replies.map((r) => r.id)];
      if (allCommentIds.length > 0) {
        const [userLikes, userBookmarks] = await Promise.all([
          prisma.like.findMany({
            where: { userId: currentUserId, commentId: { in: allCommentIds } },
            select: { commentId: true },
          }),
          prisma.commentBookmark.findMany({
            where: { userId: currentUserId, commentId: { in: allCommentIds } },
            select: { commentId: true },
          }),
        ]);
        likedCommentIds = new Set(userLikes.map((l) => l.commentId).filter(Boolean) as string[]);
        bookmarkedCommentIds = new Set(userBookmarks.map((b) => b.commentId));
      }
    }

    const replyMap = new Map<string, typeof replies>();
    for (const r of replies) {
      if (r.parentId) {
        const list = replyMap.get(r.parentId) ?? [];
        list.push(r);
        replyMap.set(r.parentId, list);
      }
    }

    type ReplyWithRelations = (typeof replies)[number];
    type NestedReply = ReplyWithRelations & {
      name: string | undefined;
      avatar: string | null | undefined;
      gender: string | null | undefined;
      liked: boolean;
      bookmarked: boolean;
      replies: NestedReply[];
    };

    // Helper function to build nested replies recursively
    function buildNestedReplies(parentId: string): NestedReply[] {
      const childReplies = replyMap.get(parentId) ?? [];
      return childReplies.map((r) => {
        const rAnon = r.isAnonymous ? generateAnonymousIdentity(r.authorId) : null;
        return {
          ...r,
          name: r.isAnonymous ? rAnon?.name : r.author?.nickname,
          avatar: r.isAnonymous ? rAnon?.avatar : r.author?.avatar,
          gender: r.isAnonymous ? "other" : r.author?.gender,
          liked: likedCommentIds.has(r.id),
          bookmarked: bookmarkedCommentIds.has(r.id),
          // Include nested replies (level 3+)
          replies: buildNestedReplies(r.id),
        };
      });
    }

    const nested = paginatedTopLevel.map((c) => {
      const cAnon = c.isAnonymous ? generateAnonymousIdentity(c.authorId) : null;
      return {
        ...c,
        name: c.isAnonymous ? cAnon?.name : c.author?.nickname,
        avatar: c.isAnonymous ? cAnon?.avatar : c.author?.avatar,
        gender: c.isAnonymous ? "other" : c.author?.gender,
        liked: likedCommentIds.has(c.id),
        bookmarked: bookmarkedCommentIds.has(c.id),
        // Build nested replies (level 2+)
        replies: buildNestedReplies(c.id),
      };
    });

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
        isAnonymous: data.isAnonymous ?? false,
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
