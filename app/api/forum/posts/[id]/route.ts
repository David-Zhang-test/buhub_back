import { NextRequest, NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { handleError } from "@/src/lib/errors";
import { updatePostSchema } from "@/src/schemas/post.schema";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { invalidateEntityTranslations } from "@/src/services/translation.service";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage, type AppLanguage } from "@/src/lib/language";
import { parseFunctionRef, resolveFunctionRefPreviews } from "@/src/lib/function-ref";

function buildQuotedPost(
  originalPost:
    | {
        id: string;
        sourceLanguage: string;
        content: string;
        anonymousName: string | null;
        anonymousAvatar: string | null;
        createdAt: Date;
        isAnonymous: boolean;
        author: {
          id: string;
          nickname: string | null;
          avatar: string | null;
          gender: string | null;
        };
      }
    | null,
  language: AppLanguage
) {
  if (!originalPost) return null;

  const quotedAnonIdentity = originalPost.isAnonymous
    ? resolveAnonymousIdentity(
        {
          anonymousName: originalPost.anonymousName,
          anonymousAvatar: originalPost.anonymousAvatar,
          authorId: originalPost.author.id,
        },
        language
      )
    : null;

  return {
    id: originalPost.id,
    sourceLanguage: originalPost.sourceLanguage,
    content: originalPost.content,
    name: originalPost.isAnonymous ? quotedAnonIdentity?.name : originalPost.author?.nickname,
    avatar: originalPost.isAnonymous ? quotedAnonIdentity?.avatar : originalPost.author?.avatar,
    gender: originalPost.isAnonymous ? "other" : originalPost.author?.gender,
    createdAt: originalPost.createdAt.toISOString(),
    isAnonymous: originalPost.isAnonymous,
  };
}

function buildAnonymousAuthor(
  post: {
    authorId: string;
    anonymousName: string | null;
    anonymousAvatar: string | null;
  },
  language: AppLanguage
) {
  const identity = resolveAnonymousIdentity(
    {
      anonymousName: post.anonymousName,
      anonymousAvatar: post.anonymousAvatar,
      authorId: post.authorId,
    },
    language
  );

  return {
    nickname: identity.name,
    avatar: identity.avatar,
    gender: "other",
    grade: null,
    major: null,
    userName: null,
  };
}

function serializePostDetail(input: {
  post: {
    id: string;
    postType: string;
    sourceLanguage: string;
    content: string;
    images: string[];
    tags: string[];
    createdAt: Date;
    likeCount: number;
    commentCount: number;
    isAnonymous: boolean;
    anonymousName?: string | null;
    anonymousAvatar?: string | null;
    pollOptions?: Array<{ id: string; text: string; voteCount: number }>;
  };
  author: {
    nickname?: string | null;
    avatar?: string | null;
    gender?: string | null;
    grade?: string | null;
    major?: string | null;
    userName?: string | null;
  };
  quotedPost: ReturnType<typeof buildQuotedPost>;
  functionRefPreview: Awaited<ReturnType<typeof resolveFunctionRefPreviews>> extends Map<string, infer TValue>
    ? TValue | undefined
    : undefined;
  isOwnedByCurrentUser: boolean;
  liked: boolean;
  bookmarked: boolean;
  voteRecord?: { id: string; optionId: string; createdAt: Date } | null;
}) {
  const { post, author, quotedPost, functionRefPreview, isOwnedByCurrentUser, liked, bookmarked, voteRecord } =
    input;

  return {
    id: post.id,
    postType: post.postType,
    sourceLanguage: post.sourceLanguage,
    lang: post.sourceLanguage,
    content: post.content,
    images: post.images,
    hasImage: post.images.length > 0,
    image: post.images[0] ?? null,
    tags: post.tags,
    createdAt: post.createdAt.toISOString(),
    likes: post.likeCount,
    comments: post.commentCount,
    isAnonymous: post.isAnonymous,
    anonymousName: post.anonymousName ?? null,
    anonymousAvatar: post.anonymousAvatar ?? null,
    avatar: author.avatar ?? null,
    name: author.nickname ?? null,
    isOwnedByCurrentUser,
    userName: post.isAnonymous ? null : (author.userName ?? null),
    gender: post.isAnonymous ? "other" : (author.gender ?? null),
    gradeKey: post.isAnonymous ? undefined : (author.grade ?? undefined),
    majorKey: post.isAnonymous ? undefined : (author.major ?? undefined),
    meta: post.isAnonymous ? "" : [author.grade, author.major].filter(Boolean).join(" · "),
    pollOptions: post.pollOptions?.map((option) => ({
      id: option.id,
      text: option.text,
      voteCount: option.voteCount,
    })),
    quotedPost,
    functionRefPreview,
    liked,
    bookmarked,
    ...(voteRecord
      ? {
          myVote: {
            id: voteRecord.id,
            optionId: voteRecord.optionId,
            createdAt: voteRecord.createdAt.toISOString(),
          },
        }
      : {}),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const appLanguage = resolveRequestLanguage(req.headers);
    const { id } = await params;

    const post: any = await prisma.post.findFirst({
      where: { id, isDeleted: false },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
        pollOptions: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
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
    } as any);

    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    const quotedPost = buildQuotedPost(post.originalPost, appLanguage);
    const author = post.isAnonymous ? buildAnonymousAuthor(post, appLanguage) : post.author;
    const parsedFunctionRef = parseFunctionRef(post.content).ref;
    const functionRefPreview = parsedFunctionRef
      ? (await resolveFunctionRefPreviews([parsedFunctionRef])).get(`${parsedFunctionRef.type}:${parsedFunctionRef.id}`)
      : undefined;

    let liked = false;
    let bookmarked = false;
    let currentUserId: string | null = null;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;

      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: user.id, blockedId: post.authorId },
            { blockerId: post.authorId, blockedId: user.id },
          ],
        },
      });
      if (blocked) {
        return NextResponse.json(
          { success: false, error: { code: "BLOCKED", message: "Cannot view this post" } },
          { status: 403 }
        );
      }

      const [likeRecord, bookmarkRecord, voteRecord] = await Promise.all([
        prisma.like.findFirst({ where: { userId: user.id, postId: id } }),
        prisma.bookmark.findUnique({
          where: { userId_postId: { userId: user.id, postId: id } },
        }),
        post.postType === "poll"
          ? prisma.vote.findUnique({
              where: { postId_userId: { postId: id, userId: user.id } },
              select: { id: true, optionId: true, createdAt: true },
            })
          : Promise.resolve(null),
      ]);
      liked = !!likeRecord;
      bookmarked = !!bookmarkRecord;

      await redis.incr(`post:views:${id}`);

      return NextResponse.json({
        success: true,
        data: serializePostDetail({
          post,
          author,
          quotedPost,
          functionRefPreview,
          isOwnedByCurrentUser: post.authorId === currentUserId,
          liked,
          bookmarked,
          voteRecord,
        }),
      });
    } catch {
      // Not logged in
    }

    await redis.incr(`post:views:${id}`);

    return NextResponse.json({
      success: true,
      data: serializePostDetail({
        post,
        author,
        quotedPost,
        functionRefPreview,
        isOwnedByCurrentUser: false,
        liked: false,
        bookmarked: false,
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;
    const body = await req.json();
    const data = updatePostSchema.parse(body);

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    if (post.authorId !== user.id && user.role !== "ADMIN" && user.role !== "MODERATOR") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized to edit" } },
        { status: 403 }
      );
    }

    const nextContent =
      data.content !== undefined
        ? DOMPurify.sanitize(data.content, { ALLOWED_TAGS: [] })
        : post.content;

    await prisma.post.update({
      where: { id },
      data: {
        ...(data.content !== undefined && {
          content: nextContent,
          sourceLanguage: detectContentLanguage([nextContent], resolveAppLanguage(user.language)),
        }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    });
    await invalidateEntityTranslations("post", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { id } = await params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    const isAdminOrMod = user.role === "ADMIN" || user.role === "MODERATOR";
    if (post.authorId !== user.id && !isAdminOrMod) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized to delete" } },
        { status: 403 }
      );
    }

    await prisma.$transaction([
      prisma.comment.updateMany({
        where: { postId: id },
        data: { isDeleted: true },
      }),
      prisma.post.update({
        where: { id },
        data: { isDeleted: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
