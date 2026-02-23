import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

function toUserPost(p: { id: string; content: string; likeCount: number; commentCount: number; createdAt: Date }) {
  return {
    postId: p.id,
    lang: "en",
    content: p.content,
    time: p.createdAt.toISOString(),
    likes: p.likeCount,
    comments: p.commentCount,
  };
}

function toUserComment(c: {
  postId: string;
  id: string;
  content: string;
  likeCount: number;
  createdAt: Date;
  post: { content: string; author?: { nickname: string } };
  author: { nickname: string };
}) {
  return {
    postId: c.postId,
    commentId: c.id,
    postAuthor: c.post?.author?.nickname ?? "?",
    postContent: (c.post as { content?: string })?.content ?? "",
    comment: c.content,
    time: c.createdAt.toISOString(),
    likes: c.likeCount,
  };
}

function toLikedPost(p: {
  id: string;
  content: string;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  author: { nickname: string; avatar: string; gender?: string };
}) {
  return {
    postId: p.id,
    author: p.author.nickname,
    avatar: p.author.avatar,
    gender: p.author.gender ?? "other",
    content: p.content,
    time: p.createdAt.toISOString(),
    likes: p.likeCount,
    comments: p.commentCount,
  };
}

function toLikedComment(c: {
  id: string;
  postId: string;
  content: string;
  likeCount: number;
  createdAt: Date;
  author: { nickname: string };
  post: { id: string; content: string; author?: { nickname: string } };
}) {
  return {
    postId: c.postId,
    commentId: c.id,
    postAuthor: (c.post as { author?: { nickname: string } })?.author?.nickname ?? "?",
    postContent: (c.post as { content?: string })?.content ?? "",
    commentAuthor: c.author.nickname,
    comment: c.content,
    time: c.createdAt.toISOString(),
    likes: c.likeCount,
  };
}

function toWantedItem(
  item: { title: string; price: string; condition: string; author: { nickname: string; avatar: string; gender?: string }; createdAt: Date },
  index: number
) {
  return {
    itemIndex: index,
    title: item.title,
    price: item.price,
    condition: item.condition,
    seller: item.author.nickname,
    avatar: item.author.avatar,
    gender: (item.author.gender as string) ?? "other",
    time: item.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const [
      posts,
      anonPosts,
      comments,
      anonComments,
      likes,
      commentBookmarks,
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
        where: { authorId: user.id, isDeleted: false, isAnonymous: false },
        include: {
          post: { include: { author: { select: { nickname: true } } } },
          author: { select: { nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: true },
        include: {
          post: { include: { author: { select: { nickname: true } } } },
          author: { select: { nickname: true } },
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
              post: { include: { author: { select: { nickname: true } } } },
            },
          },
        },
      }),
      prisma.commentBookmark.findMany({
        where: { userId: user.id },
        include: {
          comment: {
            include: {
              author: { select: { nickname: true } },
              post: { include: { author: { select: { nickname: true } } } },
            },
          },
        },
      }),
      prisma.secondhandWant.findMany({
        where: { userId: user.id },
        include: {
          item: { include: { author: { select: { nickname: true, avatar: true, gender: true } } } },
        },
      }),
      prisma.follow.count({ where: { followerId: user.id } }),
      prisma.follow.count({ where: { followingId: user.id } }),
      prisma.bookmark.count({ where: { userId: user.id } }),
    ]);

    const postLikes = likes.filter((l) => l.postId && l.post);
    const commentLikes = likes.filter((l) => l.commentId && l.comment);

    const myLikesPosts = postLikes.map((l) => toLikedPost(l.post!));
    const myLikesComments = commentLikes.map((l) => toLikedComment(l.comment!));
    const myBookmarksComments = commentBookmarks
      .map((cb) => cb.comment)
      .filter(Boolean)
      .map((c) => toLikedComment(c as Parameters<typeof toLikedComment>[0]));

    return NextResponse.json({
      success: true,
      data: {
        posts: posts.map(toUserPost),
        comments: comments.map(toUserComment),
        anonPosts: anonPosts.map(toUserPost),
        anonComments: anonComments.map(toUserComment),
        myLikes: {
          posts: myLikesPosts,
          comments: myLikesComments,
        },
        myBookmarks: {
          comments: myBookmarksComments,
        },
        myWants: secondhandWants.map((w, i) => toWantedItem(w.item, i)),
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
