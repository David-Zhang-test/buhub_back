import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, type: "comment" },
      include: {
        actor: {
          select: {
            nickname: true,
            avatar: true,
            gender: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const postIds = notifications.map((n) => n.postId).filter(Boolean) as string[];
    const commentIds = notifications.map((n) => n.commentId).filter(Boolean) as string[];

    const [posts, comments] = await Promise.all([
      postIds.length
        ? prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, content: true },
          })
        : [],
      commentIds.length
        ? prisma.comment.findMany({
            where: { id: { in: commentIds } },
            select: { id: true, content: true },
          })
        : [],
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p.content]));
    const commentMap = new Map(comments.map((c) => [c.id, c.content]));

    const data = notifications.map((n) => ({
      id: n.id,
      avatar: n.actor?.avatar,
      name: n.actor?.nickname,
      gender: n.actor?.gender ?? "other",
      postContent: ((n.postId && postMap.get(n.postId)) ?? "").slice(0, 50) + "...",
      comment: (n.commentId && commentMap.get(n.commentId)) ?? "",
      time: n.createdAt.toISOString(),
      isRead: n.isRead,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
