import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const [
      posts,
      anonPosts,
      comments,
      likes,
      bookmarks,
      secondhandWants,
      followingCount,
      followersCount,
      bookmarkCount,
    ] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.post.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false },
        include: {
          post: {
            select: {
              id: true,
              content: true,
              author: { select: { nickname: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.like.findMany({
        where: { userId: user.id },
        include: {
          post: {
            include: { author: { select: { nickname: true, avatar: true, gender: true } } },
          },
          comment: {
            include: {
              author: { select: { nickname: true } },
              post: { select: { id: true, content: true, author: { select: { nickname: true } } } },
            },
          },
        },
      }),
      prisma.bookmark.findMany({
        where: { userId: user.id },
        include: {
          comment: {
            include: {
              author: { select: { nickname: true } },
              post: { select: { id: true, content: true, author: { select: { nickname: true } } } },
            },
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

    const postLikes = likes.filter((l) => l.postId && l.post);
    const commentLikes = likes.filter((l) => l.commentId && l.comment);
    const commentBookmarks = bookmarks.filter((b) => b.commentId && b.comment);

    return NextResponse.json({
      success: true,
      data: {
        posts: posts.map((p) => ({
          postId: p.id,
          content: p.content,
          time: p.createdAt.toISOString(),
          likes: p.likeCount,
          comments: p.commentCount,
          lang: "en",
        })),
        comments: comments.map((c) => ({
          postId: c.post?.id ?? "",
          commentId: c.id,
          postAuthor: c.post?.author?.nickname ?? "",
          postContent: c.post?.content ?? "",
          comment: c.content,
          time: c.createdAt.toISOString(),
          likes: c.likeCount,
        })),
        anonPosts: anonPosts.map((p) => ({
          postId: p.id,
          content: p.content,
          time: p.createdAt.toISOString(),
          likes: p.likeCount,
          comments: p.commentCount,
          lang: "en",
        })),
        anonComments: [],
        myLikes: {
          posts: postLikes.map((l) => ({
            postId: l.post!.id,
            author: l.post!.author.nickname,
            avatar: l.post!.author.avatar,
            gender: l.post!.author.gender ?? "other",
            content: l.post!.content,
            time: l.createdAt.toISOString(),
            likes: l.post!.likeCount,
            comments: l.post!.commentCount,
          })),
          comments: commentLikes.map((l) => ({
            postId: l.comment!.post?.id ?? "",
            commentId: l.comment!.id,
            postAuthor: (l.comment!.post as any)?.author?.nickname ?? "",
            postContent: l.comment!.post?.content ?? "",
            commentAuthor: l.comment!.author.nickname,
            comment: l.comment!.content,
            time: l.createdAt.toISOString(),
            likes: l.comment!.likeCount,
          })),
        },
        myBookmarks: {
          comments: commentBookmarks.map((b) => ({
            postId: b.comment!.post?.id ?? "",
            commentId: b.comment!.id,
            postAuthor: (b.comment!.post as any)?.author?.nickname ?? "",
            postContent: b.comment!.post?.content ?? "",
            commentAuthor: b.comment!.author.nickname,
            comment: b.comment!.content,
            time: b.createdAt.toISOString(),
            likes: b.comment!.likeCount,
          })),
        },
        myWants: secondhandWants.map((w) => ({
          itemIndex: 0,
          title: w.item.title,
          price: w.item.price,
          condition: w.item.condition,
          seller: w.item.author.nickname,
          avatar: "",
          gender: "other",
          time: w.createdAt.toISOString(),
        })),
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
