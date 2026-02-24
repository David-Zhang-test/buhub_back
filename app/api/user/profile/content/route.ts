import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { generateAnonymousIdentity } from "@/src/lib/anonymous";

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const [
      posts,
      anonPosts,
      comments,
      anonComments,
      likes,
      bookmarks,
      secondhandWants,
      followingCount,
      followersCount,
      bookmarkCount,
    ] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: false },
        include: {
          author: {
            select: {
              nickname: true,
              avatar: true,
              gender: true,
              grade: true,
              major: true,
              userName: true,
            },
          },
          pollOptions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.post.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: true },
        include: {
          author: {
            select: {
              nickname: true,
              avatar: true,
              gender: true,
              grade: true,
              major: true,
              userName: true,
            },
          },
          pollOptions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: false },
        include: {
          post: { select: { id: true, content: true, author: { select: { nickname: true } } } },
          author: { select: { nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: true },
        include: {
          post: { select: { id: true, content: true, author: { select: { nickname: true } } } },
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
              post: { select: { id: true, content: true, author: { select: { nickname: true } } } },
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
              post: { select: { id: true, content: true, author: { select: { nickname: true } } } },
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
      Promise.all([
        prisma.bookmark.count({ where: { userId: user.id } }),
        prisma.commentBookmark.count({ where: { userId: user.id } }),
      ]).then(([a, b]) => a + b),
    ]);

    const postLikes = likes.filter((l) => l.postId && l.post);
    const commentLikes = likes.filter((l) => l.commentId && l.comment);
    const commentBookmarks = bookmarks.map((b) => b.comment).filter(Boolean);

    const likedPostIds = new Set(postLikes.map((l) => l.postId));
    const bookmarkedPostIds = new Set(
      (
        await prisma.bookmark.findMany({
          where: { userId: user.id },
          select: { postId: true },
        })
      )
        .map((b) => b.postId)
        .filter(Boolean)
    );

    const pollPostIds = [...posts, ...anonPosts]
      .filter((p) => p.postType === "poll")
      .map((p) => p.id);
    const userVotesByPost = new Map<string, { id: string; optionId: string; createdAt: Date }>();
    if (pollPostIds.length > 0) {
      const votes = await prisma.vote.findMany({
        where: { userId: user.id, postId: { in: pollPostIds } },
        select: { id: true, postId: true, optionId: true, createdAt: true },
      });
      for (const v of votes) {
        userVotesByPost.set(v.postId, { id: v.id, optionId: v.optionId, createdAt: v.createdAt });
      }
    }

    const toPollOptions = (options: { id: string; text: string; voteCount: number }[]) => {
      const totalVotes = options.reduce((sum, option) => sum + option.voteCount, 0);
      return options.map((option) => ({
        id: option.id,
        text: option.text,
        voteCount: option.voteCount,
        percent: totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0,
      }));
    };

    return NextResponse.json({
      success: true,
      data: {
        posts: posts.map((p) => {
          const pollOptions = p.postType === "poll" ? toPollOptions(p.pollOptions ?? []) : undefined;
          const vote = p.postType === "poll" ? userVotesByPost.get(p.id) : undefined;
          // Handle quoted post
          let quotedPost: { id: string; name: string; content: string; createdAt: string } | undefined;
          if (p.originalPost) {
            const quotedAnonIdentity = p.originalPost.isAnonymous
              ? generateAnonymousIdentity(p.originalPost.author.id)
              : null;
            quotedPost = {
              id: p.originalPost.id,
              name: p.originalPost.isAnonymous
                ? (quotedAnonIdentity?.name || "匿名用户")
                : p.originalPost.author?.nickname,
              content: p.originalPost.content,
              createdAt: p.originalPost.createdAt.toISOString(),
            };
          }
          return {
            postId: p.id,
            name: p.author.nickname,
            avatar: p.author.avatar,
            defaultAvatar: p.author.avatar,
            gender: p.author.gender ?? "other",
            gradeKey: p.author.grade,
            majorKey: p.author.major,
            meta: [p.author.grade, p.author.major].filter(Boolean).join(" · "),
            content: p.content,
            time: p.createdAt.toISOString(),
            likes: p.likeCount,
            comments: p.commentCount,
            tags: p.tags,
            images: p.images,
            hasImage: (p.images?.length ?? 0) > 0,
            image: p.images?.[0],
            isAnonymous: false,
            postType: p.postType,
            isPoll: p.postType === "poll",
            pollOptions,
            quotedPost,
            ...(vote
              ? { myVote: { id: vote.id, optionId: vote.optionId, createdAt: vote.createdAt.toISOString() } }
              : {}),
            liked: likedPostIds.has(p.id),
            bookmarked: bookmarkedPostIds.has(p.id),
            lang: "en",
          };
        }),
        comments: comments.map((c) => ({
          postId: c.post?.id ?? "",
          commentId: c.id,
          postAuthor: c.post?.author?.nickname ?? "",
          postContent: c.post?.content ?? "",
          comment: c.content,
          time: c.createdAt.toISOString(),
          likes: c.likeCount,
        })),
        anonPosts: anonPosts.map((p) => {
          const pollOptions = p.postType === "poll" ? toPollOptions(p.pollOptions ?? []) : undefined;
          const vote = p.postType === "poll" ? userVotesByPost.get(p.id) : undefined;
          const anonIdentity = generateAnonymousIdentity(p.authorId);
          // Handle quoted post
          let quotedPost: { id: string; name: string; content: string; createdAt: string } | undefined;
          if (p.originalPost) {
            const quotedAnonIdentity = p.originalPost.isAnonymous
              ? generateAnonymousIdentity(p.originalPost.author.id)
              : null;
            quotedPost = {
              id: p.originalPost.id,
              name: p.originalPost.isAnonymous
                ? (quotedAnonIdentity?.name || "匿名用户")
                : p.originalPost.author?.nickname,
              content: p.originalPost.content,
              createdAt: p.originalPost.createdAt.toISOString(),
            };
          }
          return {
            postId: p.id,
            name: anonIdentity.name,
            avatar: anonIdentity.avatar,
            defaultAvatar: undefined,
            gender: "other",
            gradeKey: undefined,
            majorKey: undefined,
            meta: "",
            content: p.content,
            time: p.createdAt.toISOString(),
            likes: p.likeCount,
            comments: p.commentCount,
            tags: p.tags,
            images: p.images,
            hasImage: (p.images?.length ?? 0) > 0,
            image: p.images?.[0],
            isAnonymous: true,
            postType: p.postType,
            isPoll: p.postType === "poll",
            pollOptions,
            quotedPost,
            ...(vote
              ? { myVote: { id: vote.id, optionId: vote.optionId, createdAt: vote.createdAt.toISOString() } }
              : {}),
            liked: likedPostIds.has(p.id),
            bookmarked: bookmarkedPostIds.has(p.id),
            lang: "en",
          };
        }),
        anonComments: anonComments.map((c) => ({
          postId: c.post?.id ?? "",
          commentId: c.id,
          postAuthor: c.post?.author?.nickname ?? "",
          postContent: c.post?.content ?? "",
          comment: c.content,
          time: c.createdAt.toISOString(),
          likes: c.likeCount,
        })),
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
            postAuthor: (l.comment!.post as { author?: { nickname: string } })?.author?.nickname ?? "",
            postContent: l.comment!.post?.content ?? "",
            commentAuthor: l.comment!.author.nickname,
            comment: l.comment!.content,
            time: l.createdAt.toISOString(),
            likes: l.comment!.likeCount,
          })),
        },
        myBookmarks: {
          comments: commentBookmarks.map((c) => ({
            postId: c.post?.id ?? "",
            commentId: c.id,
            postAuthor: (c.post as { author?: { nickname: string } })?.author?.nickname ?? "",
            postContent: (c.post as { content?: string })?.content ?? "",
            commentAuthor: c.author.nickname,
            comment: c.content,
            time: c.createdAt.toISOString(),
            likes: c.likeCount,
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
