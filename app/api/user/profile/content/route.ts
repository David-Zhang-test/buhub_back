import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveRequestLanguage } from "@/src/lib/language";
import { localizeSecondhandCondition } from "@/src/lib/secondhand-condition";

type ProfilePost = {
  id: string;
  authorId: string;
  isAnonymous: boolean;
  anonymousName?: string | null;
  anonymousAvatar?: string | null;
  postType: string;
  sourceLanguage: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  tags: string[];
  images: string[];
  pollOptions?: { id: string; text: string; voteCount: number }[];
  originalPost?: {
    id: string;
    sourceLanguage: string;
    content: string;
    createdAt: Date;
    isAnonymous: boolean;
    anonymousName?: string | null;
    anonymousAvatar?: string | null;
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

type FunctionRefType = "partner" | "errand" | "secondhand" | "rating";

type ParsedFunctionRef = {
  content: string;
  isFunction?: true;
  functionType?: FunctionRefType;
  functionId?: string;
  functionTitle?: string;
};

const FUNCTION_REF_PREFIX = "[FUNC_REF]";

function parseFunctionRef(content: string): ParsedFunctionRef {
  if (!content.startsWith(FUNCTION_REF_PREFIX)) {
    return { content };
  }

  const newlineIndex = content.indexOf("\n");
  if (newlineIndex < 0) {
    return { content };
  }

  const rawPayload = content.slice(FUNCTION_REF_PREFIX.length, newlineIndex);
  const parsedContent = content.slice(newlineIndex + 1);
  try {
    const payload = JSON.parse(rawPayload) as {
      type?: FunctionRefType;
      id?: string;
      title?: string;
    };
    if (!payload.type || !payload.id || !payload.title) {
      return { content: parsedContent };
    }
    return {
      content: parsedContent,
      isFunction: true,
      functionType: payload.type,
      functionId: payload.id,
      functionTitle: payload.title,
    };
  } catch {
    return { content: parsedContent };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const appLanguage = resolveRequestLanguage(req.headers);

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
              sourceLanguage: true,
              content: true,
              anonymousName: true,
              anonymousAvatar: true,
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
      } as any),
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
              sourceLanguage: true,
              content: true,
              anonymousName: true,
              anonymousAvatar: true,
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
      } as any),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: false },
        include: {
          post: { select: { id: true, content: true, isAnonymous: true, anonymousName: true, anonymousAvatar: true, author: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } } } },
          author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } },
          parent: { select: { isAnonymous: true, authorId: true, anonymousName: true, anonymousAvatar: true, author: { select: { nickname: true } } } },
        },
        orderBy: { createdAt: "desc" },
      } as any),
      prisma.comment.findMany({
        where: { authorId: user.id, isDeleted: false, isAnonymous: true },
        include: {
          post: { select: { id: true, content: true, isAnonymous: true, anonymousName: true, anonymousAvatar: true, author: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } } } },
          author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true, userName: true } },
          parent: { select: { isAnonymous: true, authorId: true, anonymousName: true, anonymousAvatar: true, author: { select: { nickname: true } } } },
        },
        orderBy: { createdAt: "desc" },
      } as any),
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
                  sourceLanguage: true,
                  content: true,
                  anonymousName: true,
                  anonymousAvatar: true,
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
              post: { select: { id: true, content: true, isDeleted: true, isAnonymous: true, anonymousName: true, anonymousAvatar: true, author: { select: { id: true, nickname: true } } } },
              parent: { select: { isAnonymous: true, authorId: true, anonymousName: true, anonymousAvatar: true, author: { select: { nickname: true } } } },
            },
          },
        },
      } as any),
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
                  sourceLanguage: true,
                  content: true,
                  anonymousName: true,
                  anonymousAvatar: true,
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
      } as any),
      prisma.commentBookmark.findMany({
        where: { userId: user.id },
        include: {
          comment: {
            include: {
              author: { select: { nickname: true, avatar: true, gender: true, grade: true, major: true } },
              post: { select: { id: true, content: true, isDeleted: true, isAnonymous: true, anonymousName: true, anonymousAvatar: true, author: { select: { id: true, nickname: true } } } },
              parent: { select: { isAnonymous: true, authorId: true, anonymousName: true, anonymousAvatar: true, author: { select: { nickname: true } } } },
            },
          },
        },
      } as any),
      prisma.secondhandWant.findMany({
        where: { userId: user.id },
        include: {
          item: { include: { author: { select: { nickname: true, avatar: true, gender: true } } } },
        },
      }),
      prisma.follow.count({ where: { followerId: user.id } }),
      prisma.follow.count({ where: { followingId: user.id } }),
    ]) as any;

    const postLikes = likes.filter((l: any) => l.postId && l.post && !l.post.isDeleted);
    const commentLikes = likes.filter(
      (l: any) =>
        l.commentId &&
        l.comment &&
        !l.comment.isDeleted &&
        !!l.comment.post &&
        !l.comment.post.isDeleted
    );
    const commentBookmarks = bookmarks
      .map((b: any) => b.comment)
      .filter((c: any): c is NonNullable<typeof c> => !!c && !c.isDeleted && !!c.post && !c.post.isDeleted);
    const validPostBookmarks = postBookmarks.filter(
      (b: any) => b.postId && b.post && !b.post.isDeleted
    );

    // Get IDs of liked and bookmarked comments by current user
    const likedCommentIds = new Set(commentLikes.map((l: any) => l.commentId));
    const bookmarkedCommentIds = new Set(commentBookmarks.map((c: any) => c.id));

    const likedPostIds = new Set(postLikes.map((l: any) => l.postId));
    const bookmarkedPostIds = new Set(
      validPostBookmarks
        .map((b: any) => b.postId)
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
      ...postLikes.map((l: any) => l.post).filter(Boolean),
      ...validPostBookmarks.map((b: any) => b.post).filter(Boolean),
    ];
    const pollPostIds = Array.from(
      new Set(
        candidatePostsForVotes
          .filter((p: any): p is NonNullable<typeof p> => !!p && !p.isDeleted && p.postType === "poll")
          .map((p: any) => p.id)
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

    const getAnonymousName = (source?: {
      anonymousName?: string | null;
      anonymousAvatar?: string | null;
      authorId?: string | null;
    } | null) =>
      resolveAnonymousIdentity(
        {
          anonymousName: source?.anonymousName,
          anonymousAvatar: source?.anonymousAvatar,
          authorId: source?.authorId,
        },
        appLanguage
      ).name;

    const getPostAuthorName = (post?: {
      isAnonymous?: boolean;
      anonymousName?: string | null;
      anonymousAvatar?: string | null;
      author?: { id?: string | null; nickname?: string | null } | null;
    } | null) => {
      if (!post) return "";
      if (post.isAnonymous) {
        return getAnonymousName({
          anonymousName: post.anonymousName,
          anonymousAvatar: post.anonymousAvatar,
          authorId: post.author?.id,
        });
      }
      return post.author?.nickname ?? "";
    };

    const getReplyToName = (
      comment?: {
        parent?: {
          isAnonymous?: boolean;
          authorId?: string | null;
          anonymousName?: string | null;
          anonymousAvatar?: string | null;
          author?: { nickname?: string | null } | null;
        } | null;
        post?: {
          isAnonymous?: boolean;
          anonymousName?: string | null;
          anonymousAvatar?: string | null;
          author?: { id?: string | null; nickname?: string | null } | null;
        } | null;
      } | null
    ) => {
      if (comment?.parent) {
        if (comment.parent.isAnonymous) {
          return getAnonymousName({
            anonymousName: comment.parent.anonymousName,
            anonymousAvatar: comment.parent.anonymousAvatar,
            authorId: comment.parent.authorId,
          });
        }
        return comment.parent.author?.nickname ?? getPostAuthorName(comment.post);
      }
      return getPostAuthorName(comment?.post);
    };

    const mapPostForProfile = (
      p: ProfilePost,
      options?: { forceLiked?: boolean; forceBookmarked?: boolean }
    ) => {
      const functionRef = parseFunctionRef(p.content);
      const pollOptions = p.postType === "poll" ? toPollOptions(p.pollOptions ?? []) : undefined;
      const vote = p.postType === "poll" ? userVotesByPost.get(p.id) : undefined;
      const anonIdentity = p.isAnonymous
        ? resolveAnonymousIdentity(
            {
              anonymousName: p.anonymousName,
              anonymousAvatar: p.anonymousAvatar,
              authorId: p.authorId,
            },
            appLanguage
          )
        : null;
      let quotedPost:
        | { id: string; name: string; sourceLanguage: string; content: string; createdAt: string }
        | undefined;
      if (p.originalPost) {
        const quotedAnonIdentity = p.originalPost.isAnonymous
          ? resolveAnonymousIdentity(
              {
                anonymousName: p.originalPost.anonymousName,
                anonymousAvatar: p.originalPost.anonymousAvatar,
                authorId: p.originalPost.author.id,
              },
              appLanguage
            )
          : null;
        quotedPost = {
          id: p.originalPost.id,
          name: p.originalPost.isAnonymous
            ? (quotedAnonIdentity?.name || "匿名用户")
            : (p.originalPost.author?.nickname ?? ""),
          sourceLanguage: p.originalPost.sourceLanguage,
          content: p.originalPost.content,
          createdAt: p.originalPost.createdAt.toISOString(),
        };
      }
      return {
        postId: p.id,
        name: p.isAnonymous ? (anonIdentity?.name ?? "匿名用户") : (p.author?.nickname ?? ""),
        userName: p.isAnonymous ? undefined : (p.author?.userName ?? undefined),
        avatar: p.isAnonymous ? (anonIdentity?.avatar ?? "") : (p.author?.avatar ?? ""),
        defaultAvatar: p.isAnonymous ? undefined : (p.author?.avatar ?? undefined),
        gender: p.isAnonymous ? ("other" as const) : (p.author?.gender ?? "other"),
        gradeKey: p.isAnonymous ? undefined : (p.author?.grade ?? undefined),
        majorKey: p.isAnonymous ? undefined : (p.author?.major ?? undefined),
        meta: p.isAnonymous ? "" : [p.author?.grade, p.author?.major].filter(Boolean).join(" · "),
        content: functionRef.content,
        sourceLanguage: p.sourceLanguage,
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
        isFunction: functionRef.isFunction,
        functionType: functionRef.functionType,
        functionId: functionRef.functionId,
        functionTitle: functionRef.functionTitle,
        ...(vote
          ? { myVote: { id: vote.id, optionId: vote.optionId, createdAt: vote.createdAt.toISOString() } }
          : {}),
        liked: options?.forceLiked ?? likedPostIds.has(p.id),
        bookmarked: options?.forceBookmarked ?? bookmarkedPostIds.has(p.id),
        lang: p.sourceLanguage,
      };
    };

    return NextResponse.json({
      success: true,
      data: {
        posts: posts.map((p: any) => mapPostForProfile(p)),
        comments: comments.map((c: any) => ({
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
          postContent: parseFunctionRef(c.post?.content ?? "").content,
          comment: c.content,
          sourceLanguage: c.sourceLanguage,
          time: c.createdAt.toISOString(),
          likes: c.likeCount,
          liked: likedCommentIds.has(c.id),
          bookmarked: bookmarkedCommentIds.has(c.id),
          isAnonymous: false,
          replyCount: descendantCountByCommentId.get(c.id) ?? 0,
        })),
        anonPosts: anonPosts.map((p: any) => mapPostForProfile(p)),
        anonComments: anonComments.map((c: any) => {
          const anonIdentity = resolveAnonymousIdentity(
            {
              anonymousName: c.anonymousName,
              anonymousAvatar: c.anonymousAvatar,
              authorId: c.authorId,
            },
            appLanguage
          );
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
            postContent: parseFunctionRef(c.post?.content ?? "").content,
            comment: c.content,
            sourceLanguage: c.sourceLanguage,
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
            .map((l: any) => l.post)
            .filter((p: any): p is NonNullable<typeof p> => !!p)
            .map((p: any) => mapPostForProfile(p, { forceLiked: true })),
          comments: commentLikes.map((l: any) => {
            const comment = l.comment!;
            const isAnonymous = !!comment.isAnonymous;
            const anonIdentity = isAnonymous
              ? resolveAnonymousIdentity(
                  {
                    anonymousName: comment.anonymousName,
                    anonymousAvatar: comment.anonymousAvatar,
                    authorId: comment.authorId,
                  },
                  appLanguage
                )
              : null;
            return {
              postId: comment.post?.id ?? "",
              commentId: comment.id,
              name: isAnonymous ? (anonIdentity?.name ?? "匿名用户") : (comment.author?.nickname ?? ""),
              avatar: isAnonymous ? (anonIdentity?.avatar ?? "") : (comment.author?.avatar ?? ""),
              defaultAvatar: isAnonymous ? undefined : (comment.author?.avatar ?? undefined),
              gender: isAnonymous ? ("other" as const) : (comment.author?.gender ?? "other"),
              gradeKey: isAnonymous ? undefined : (comment.author?.grade ?? undefined),
              majorKey: isAnonymous ? undefined : (comment.author?.major ?? undefined),
              isAnonymous,
              liked: true,
              bookmarked: bookmarkedCommentIds.has(comment.id),
              replyToName: getReplyToName(comment),
              postAuthor: getPostAuthorName(comment.post as {
                isAnonymous?: boolean;
                anonymousName?: string | null;
                anonymousAvatar?: string | null;
                author?: { id?: string | null; nickname?: string | null };
              }),
              postContent: parseFunctionRef(comment.post?.content ?? "").content,
              commentAuthor: isAnonymous
                ? getAnonymousName({
                    anonymousName: comment.anonymousName,
                    anonymousAvatar: comment.anonymousAvatar,
                    authorId: comment.authorId,
                  })
                : (comment.author?.nickname ?? ""),
              comment: comment.content,
              sourceLanguage: comment.sourceLanguage,
              time: l.createdAt.toISOString(),
              likes: comment.likeCount,
              replyCount: descendantCountByCommentId.get(comment.id) ?? 0,
            };
          }),
        },
        myBookmarks: {
          posts: validPostBookmarks
            .map((b: any) => b.post)
            .filter((p: any): p is NonNullable<typeof p> => !!p)
            .map((p: any) => mapPostForProfile(p, { forceBookmarked: true })),
          comments: commentBookmarks.map((c: any) => {
            const isAnonymous = !!c.isAnonymous;
            const anonIdentity = isAnonymous
              ? resolveAnonymousIdentity(
                  {
                    anonymousName: c.anonymousName,
                    anonymousAvatar: c.anonymousAvatar,
                    authorId: c.authorId,
                  },
                  appLanguage
                )
              : null;
            return {
              postId: c.post?.id ?? "",
              commentId: c.id,
              name: isAnonymous ? (anonIdentity?.name ?? "匿名用户") : (c.author?.nickname ?? ""),
              avatar: isAnonymous ? (anonIdentity?.avatar ?? "") : (c.author?.avatar ?? ""),
              defaultAvatar: isAnonymous ? undefined : (c.author?.avatar ?? undefined),
              gender: isAnonymous ? ("other" as const) : (c.author?.gender ?? "other"),
              gradeKey: isAnonymous ? undefined : (c.author?.grade ?? undefined),
              majorKey: isAnonymous ? undefined : (c.author?.major ?? undefined),
              isAnonymous,
              liked: likedCommentIds.has(c.id),
              bookmarked: true,
              replyToName: getReplyToName(c),
              postAuthor: getPostAuthorName(c.post as {
                isAnonymous?: boolean;
                anonymousName?: string | null;
                anonymousAvatar?: string | null;
                author?: { id?: string | null; nickname?: string | null };
              }),
              postContent: parseFunctionRef((c.post as { content?: string })?.content ?? "").content,
              commentAuthor: isAnonymous
                ? getAnonymousName({
                    anonymousName: c.anonymousName,
                    anonymousAvatar: c.anonymousAvatar,
                    authorId: c.authorId,
                  })
                : (c.author?.nickname ?? ""),
              comment: c.content,
              sourceLanguage: c.sourceLanguage,
              time: c.createdAt.toISOString(),
              likes: c.likeCount,
              replyCount: descendantCountByCommentId.get(c.id) ?? 0,
            };
          }),
        },
        myWants: secondhandWants.map((w: any) => ({
          itemIndex: 0,
          title: w.item.title,
          price: w.item.price,
          condition: localizeSecondhandCondition(w.item.condition, appLanguage),
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
