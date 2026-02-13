import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const [
      posts,
      comments,
      likes,
      secondhandWants,
      followingCount,
      followersCount,
      bookmarkCount,
    ] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: false },
        include: { author: { select: { nickname: true, avatar: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false },
        include: {
          post: { select: { id: true, content: true } },
          author: { select: { nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.like.findMany({
        where: { userId: user.id },
        include: {
          post: {
            include: { author: { select: { nickname: true, avatar: true } } },
          },
          comment: {
            include: { author: { select: { nickname: true } }, post: { select: { id: true } } },
          },
        },
      }),
      prisma.secondhandWant.findMany({
        where: { userId: user.id },
        include: {
          item: { include: { author: { select: { nickname: true } } } },
        },
      }),
      prisma.follow.count({ where: { followerId: user.id } }),
      prisma.follow.count({ where: { followingId: user.id } }),
      prisma.bookmark.count({ where: { userId: user.id } }),
    ]);

    const postLikes = likes.filter((l) => l.postId);
    const commentLikes = likes.filter((l) => l.commentId);

    return NextResponse.json({
      success: true,
      data: {
        posts,
        comments,
        anonPosts: [], // Anonymous posts - can add when isAnonymous filtering
        anonComments: [],
        myLikes: {
          posts: postLikes.map((l) => l.post).filter(Boolean),
          comments: commentLikes.map((l) => l.comment).filter(Boolean),
        },
        myWants: secondhandWants.map((w) => ({ ...w.item, wantedAt: w.createdAt })),
        stats: {
          following: followingCount,
          followers: followersCount,
          collection: bookmarkCount,
        },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
