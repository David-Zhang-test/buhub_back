import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createCommentSchema } from "@/src/schemas/comment.schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      // Not logged in
    }
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

    const topLevel = await prisma.comment.findMany({
      where: { postId, parentId: null, isDeleted: false },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            userName: true,
            grade: true,
            major: true,
          },
        },
        likes: true,
      },
      orderBy: sortBy === "popular" ? { likeCount: "desc" } : { createdAt: "asc" },
      skip,
      take: limit,
    });

    const replyIds = topLevel.flatMap((c) => c.id);
    const replies = await prisma.comment.findMany({
      where: { parentId: { in: replyIds }, isDeleted: false },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            userName: true,
            grade: true,
            major: true,
          },
        },
        likes: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const replyMap = new Map<string, typeof replies>();
    for (const r of replies) {
      if (r.parentId) {
        const list = replyMap.get(r.parentId) ?? [];
        list.push(r);
        replyMap.set(r.parentId, list);
      }
    }

    const nested = topLevel.map((c) => {
      const liked = currentUserId ? c.likes.some((l) => l.userId === currentUserId) : false;
      const repliesWithLiked = (replyMap.get(c.id) ?? []).map((r) => ({
        ...r,
        liked: currentUserId ? r.likes.some((l) => l.userId === currentUserId) : false,
      }));
      return {
        ...c,
        liked,
        replies: repliesWithLiked,
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
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            userName: true,
            grade: true,
            major: true,
          },
        },
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
