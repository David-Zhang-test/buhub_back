import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { generateAnonymousIdentity } from "@/src/lib/anonymous";

type ProfilePost = {
  id: string;
  authorId: string;
  isAnonymous: boolean;
  postType: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  tags: string[];
  images: string[];
  pollOptions?: { id: string; text: string; voteCount: number }[];
  originalPost?: {
    id: string;
    content: string;
    createdAt: Date;
    isAnonymous: boolean;
    author: { id: string; nickname: string | null };
  } | null;
  author?: {
    nickname?: string | null;
    userName?: string | null;
    avatar?: string | null;
    gender?: string | null;
    grade?: string | null;
    major?: string | null;
  } | null;
};

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);

    const [
      posts,
      anonPosts,
      comments,
      anonComments,
      likes,
      postBookmarks,
      bookmarks,
      secondhandWants,
      followingCount,
      followersCount,
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
          post: { select: { id: true, content: true, isAnonymous: true, author: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } } } },
          author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } },
          parent: { select: { isAnonymous: true, authorId: true, author: { select: { nickname: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: true },
        include: {
          post: { select: { id: true, content: true, isAnonymous: true, author: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } } } },
          author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } },
          parent: { select: { isAnonymous: true, authorId: true, author: { select: { nickname: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.like.findMany({
        where: { userId: user.id },
        include: {
          post: {
            include: {
              author: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } },
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
          },
          comment: {
            include: {
              author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true } },
              post: { select: { id: true, content: true, isDeleted: true, isAnonymous: true, author: { select: { id: true, nickname: true } } } },
              parent: { select: { isAnonymous: true, authorId: true, author: { select: { nickname: true } } } },
            },
          },
        },
      }),
      prisma.bookmark.findMany({
        where: { userId: user.id },
        include: {
          post: {
            include: {
              author: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } },
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
          },
        },
      }),
      prisma.commentBookmark.findMany({
        where: { userId: user.id },
        include: {
          comment: {
            include: {
              author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true } },
              post: { select: { id: true, content: true, isDeleted: true, isAnonymous: true, author: { select: { id: true, nickname: true } } } },
              parent: { select: { isAnonymous: true, authorId: true, author: { select: { nickname: true } } } },
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
    ]);

    const postLikes = likes.filter((l) => l.postId && l.post && !l.post.isDeleted);
    const commentLikes = likes.filter(
      (l) =>
        l.commentId &&
        l.comment &&
        !l.comment.isDeleted &&
        !!l.comment.post &&
        !l.comment.post.isDeleted
    );
    const commentBookmarks = bookmarks
      .map((b) => b.comment)
      .filter((c): c is NonNullable<typeof c> => !!c && !c.isDeleted && !!c.post && !c.post.isDeleted);
    const validPostBookmarks = postBookmarks.filter(
      (b) => b.postId && b.post && !b.post.isDeleted
    );

    // Get IDs of liked and bookmarked comments by current user
    const likedCommentIds = new Set(commentLikes.map((l) => l.commentId));
    const bookmarkedCommentIds = new Set(commentBookmarks.map((c) => c.id));

    const likedPostIds = new Set(postLikes.map((l) => l.postId));
    const bookmarkedPostIds = new Set(
      validPostBookmarks
        .map((b) => b.postId)
        .filter(Boolean)
    );
    const collectionCount =
      postLikes.length +
      commentLikes.length +
      validPostBookmarks.length +
      commentBookmarks.length;

    const candidatePostsForVotes = [
      ...posts,
      ...anonPosts,
      ...postLikes.map((l) => l.post).filter(Boolean),
      ...validPostBookmarks.map((b) => b.post).filter(Boolean),
    ];
    const pollPostIds = Array.from(
      new Set(
        candidatePostsForVotes
          .filter((p): p is NonNullable<typeof p> => !!p && !p.isDeleted && p.postType === "poll")
          .map((p) => p.id)
      )
    );
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

    const targetCommentIds = new Set<string>();
    const relatedPostIds = new Set<string>();

    const registerCommentTarget = (commentId?: string | null, postId?: string | null) => {
      if (commentId) targetCommentIds.add(commentId);
      if (postId) relatedPostIds.add(postId);
    };

    for (const c of comments) registerCommentTarget(c.id, c.postId);
    for (const c of anonComments) registerCommentTarget(c.id, c.postId);
    for (const l of commentLikes) {
      registerCommentTarget(
        l.comment?.id,
        (l.comment as { postId?: string | null })?.postId ?? l.comment?.post?.id
      );
    }
    for (const c of commentBookmarks) {
      registerCommentTarget(
        c.id,
        (c as { postId?: string | null })?.postId ?? c.post?.id
      );
    }

    const descendantCountByCommentId = new Map<string, number>();
    if (targetCommentIds.size > 0 && relatedPostIds.size > 0) {
      const allPostComments = await prisma.comment.findMany({
        where: {
          isDeleted: false,
          postId: { in: Array.from(relatedPostIds) },
        },
        select: {
          id: true,
          parentId: true,
        },
      });

      const childrenByParent = new Map<string, string[]>();
      for (const node of allPostComments) {
        if (!node.parentId) continue;
        const list = childrenByParent.get(node.parentId) ?? [];
        list.push(node.id);
        childrenByParent.set(node.parentId, list);
      }

      const memo = new Map<string, number>();
      const countDescendants = (commentId: string): number => {
        const cached = memo.get(commentId);
        if (cached !== undefined) return cached;

        const children = childrenByParent.get(commentId) ?? [];
        let total = children.length;
        for (const childId of children) {
          total += countDescendants(childId);
        }
        memo.set(commentId, total);
        return total;
      };

      for (const commentId of targetCommentIds) {
        descendantCountByCommentId.set(commentId, countDescendants(commentId));
      }
    }

    const getAnonymousName = (userId?: string | null) =>
      userId ? generateAnonymousIdentity(userId).name : "Anonymous";

    const getPostAuthorName = (post?: { isAnonymous?: boolean; author?: { id?: string | null; nickname?: string | null } } | null) => {
      if (!post) return "";
      if (post.isAnonymous) return getAnonymousName(post.author?.id);
      return post.author?.nickname ?? "";
    };

    const getReplyToName = (
      comment?: {
        parent?: { isAnonymous?: boolean; authorId?: string | null; author?: { nickname?: string | null } | null } | null;
        post?: { isAnonymous?: boolean; author?: { id?: string | null; nickname?: string | null } } | null;
      } | null
    ) => {
      if (comment?.parent) {
        if (comment.parent.isAnonymous) return getAnonymousName(comment.parent.authorId);
        return comment.parent.author?.nickname ?? getPostAuthorName(comment.post);
      }
      return getPostAuthorName(comment?.post);
    };

    const mapPostForProfile = (
      p: ProfilePost,
      options?: { forceLiked?: boolean; forceBookmarked?: boolean }
    ) => {
      const pollOptions = p.postType === "poll" ? toPollOptions(p.pollOptions ?? []) : undefined;
      const vote = p.postType === "poll" ? userVotesByPost.get(p.id) : undefined;
      const anonIdentity = p.isAnonymous ? generateAnonymousIdentity(p.authorId) : null;
      let quotedPost: { id: string; name: string; content: string; createdAt: string } | undefined;
      if (p.originalPost) {
        const quotedAnonIdentity = p.originalPost.isAnonymous
          ? generateAnonymousIdentity(p.originalPost.author.id)
          : null;
        quotedPost = {
          id: p.originalPost.id,
          name: p.originalPost.isAnonymous
            ? (quotedAnonIdentity?.name || "Anonymous")
            : (p.originalPost.author?.nickname ?? ""),
          content: p.originalPost.content,
          createdAt: p.originalPost.createdAt.toISOString(),
        };
      }
      return {
        postId: p.id,
        name: p.isAnonymous ? (anonIdentity?.name ?? "Anonymous") : (p.author?.nickname ?? ""),
        userName: p.isAnonymous ? undefined : (p.author?.userName ?? undefined),
        avatar: p.isAnonymous ? (anonIdentity?.avatar ?? "") : (p.author?.avatar ?? ""),
        defaultAvatar: p.isAnonymous ? undefined : (p.author?.avatar ?? undefined),
        gender: p.isAnonymous ? ("other" as const) : (p.author?.gender ?? "other"),
        gradeKey: p.isAnonymous ? undefined : (p.author?.grade ?? undefined),
        majorKey: p.isAnonymous ? undefined : (p.author?.major ?? undefined),
        meta: p.isAnonymous ? "" : [p.author?.grade, p.author?.major].filter(Boolean).join(" · "),
        content: p.content,
        time: p.createdAt.toISOString(),
        likes: p.likeCount,
        comments: p.commentCount,
        tags: p.tags,
        images: p.images,
        hasImage: (p.images?.length ?? 0) > 0,
        image: p.images?.[0],
        isAnonymous: !!p.isAnonymous,
        postType: p.postType,
        isPoll: p.postType === "poll",
        pollOptions,
        quotedPost,
        ...(vote
          ? { myVote: { id: vote.id, optionId: vote.optionId, createdAt: vote.createdAt.toISOString() } }
          : {}),
        liked: options?.forceLiked ?? likedPostIds.has(p.id),
        bookmarked: options?.forceBookmarked ?? bookmarkedPostIds.has(p.id),
        lang: "en",
      };
    };

    return NextResponse.json({
      success: true,
      data: {
        posts: posts.map((p) => mapPostForProfile(p)),
        comments: comments.map((c) => ({
          postId: c.post?.id ?? "",
          commentId: c.id,
          name: c.author?.nickname ?? "",
          avatar: c.author?.avatar ?? "",
          defaultAvatar: c.author?.avatar,
          gender: c.author?.gender ?? "other",
          gradeKey: c.author?.grade ?? undefined,
          majorKey: c.author?.major ?? undefined,
          replyToName: getReplyToName(c),
          postAuthor: getPostAuthorName(c.post),
          postContent: c.post?.content ?? "",
          comment: c.content,
          time: c.createdAt.toISOString(),
          likes: c.likeCount,
          liked: likedCommentIds.has(c.id),
          bookmarked: bookmarkedCommentIds.has(c.id),
          isAnonymous: false,
          replyCount: descendantCountByCommentId.get(c.id) ?? 0,
        })),
        anonPosts: anonPosts.map((p) => mapPostForProfile(p)),
        anonComments: anonComments.map((c) => {
          const anonIdentity = generateAnonymousIdentity(c.authorId);
          return {
            postId: c.post?.id ?? "",
            commentId: c.id,
            name: anonIdentity.name,
            avatar: anonIdentity.avatar,
            defaultAvatar: undefined,
            gender: "other" as const,
            gradeKey: undefined,
            majorKey: undefined,
            replyToName: getReplyToName(c),
            postAuthor: getPostAuthorName(c.post),
            postContent: c.post?.content ?? "",
            comment: c.content,
            time: c.createdAt.toISOString(),
            likes: c.likeCount,
            liked: likedCommentIds.has(c.id),
            bookmarked: bookmarkedCommentIds.has(c.id),
            isAnonymous: true,
            replyCount: descendantCountByCommentId.get(c.id) ?? 0,
          };
        }),
        myLikes: {
          posts: postLikes
            .map((l) => l.post)
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => mapPostForProfile(p, { forceLiked: true })),
          comments: commentLikes.map((l) => {
            const comment = l.comment!;
            const isAnonymous = !!comment.isAnonymous;
            const anonIdentity = isAnonymous ? generateAnonymousIdentity(comment.authorId) : null;
            return {
              postId: comment.post?.id ?? "",
              commentId: comment.id,
              name: isAnonymous ? (anonIdentity?.name ?? "Anonymous") : (comment.author?.nickname ?? ""),
              avatar: isAnonymous ? (anonIdentity?.avatar ?? "") : (comment.author?.avatar ?? ""),
              defaultAvatar: isAnonymous ? undefined : (comment.author?.avatar ?? undefined),
              gender: isAnonymous ? ("other" as const) : (comment.author?.gender ?? "other"),
              gradeKey: isAnonymous ? undefined : (comment.author?.grade ?? undefined),
              majorKey: isAnonymous ? undefined : (comment.author?.major ?? undefined),
              isAnonymous,
              liked: true,
              bookmarked: bookmarkedCommentIds.has(comment.id),
              replyToName: getReplyToName(comment),
              postAuthor: getPostAuthorName(comment.post as { isAnonymous?: boolean; author?: { id?: string | null; nickname?: string | null } }),
              postContent: comment.post?.content ?? "",
              commentAuthor: isAnonymous ? getAnonymousName(comment.authorId) : (comment.author?.nickname ?? ""),
              comment: comment.content,
              time: l.createdAt.toISOString(),
              likes: comment.likeCount,
              replyCount: descendantCountByCommentId.get(comment.id) ?? 0,
            };
          }),
        },
        myBookmarks: {
          posts: validPostBookmarks
            .map((b) => b.post)
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => mapPostForProfile(p, { forceBookmarked: true })),
          comments: commentBookmarks.map((c) => {
            const isAnonymous = !!c.isAnonymous;
            const anonIdentity = isAnonymous ? generateAnonymousIdentity(c.authorId) : null;
            return {
              postId: c.post?.id ?? "",
              commentId: c.id,
              name: isAnonymous ? (anonIdentity?.name ?? "Anonymous") : (c.author?.nickname ?? ""),
              avatar: isAnonymous ? (anonIdentity?.avatar ?? "") : (c.author?.avatar ?? ""),
              defaultAvatar: isAnonymous ? undefined : (c.author?.avatar ?? undefined),
              gender: isAnonymous ? ("other" as const) : (c.author?.gender ?? "other"),
              gradeKey: isAnonymous ? undefined : (c.author?.grade ?? undefined),
              majorKey: isAnonymous ? undefined : (c.author?.major ?? undefined),
              isAnonymous,
              liked: likedCommentIds.has(c.id),
              bookmarked: true,
              replyToName: getReplyToName(c),
              postAuthor: getPostAuthorName(c.post as { isAnonymous?: boolean; author?: { id?: string | null; nickname?: string | null } }),
              postContent: (c.post as { content?: string })?.content ?? "",
              commentAuthor: isAnonymous ? getAnonymousName(c.authorId) : (c.author?.nickname ?? ""),
              comment: c.content,
              time: c.createdAt.toISOString(),
              likes: c.likeCount,
              replyCount: descendantCountByCommentId.get(c.id) ?? 0,
            };
          }),
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
          collection: collectionCount,
        },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
