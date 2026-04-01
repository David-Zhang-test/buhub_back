import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { resolveAnonymousIdentity } from "@/src/lib/anonymous";
import { resolveAppLanguage, resolveRequestLanguage } from "@/src/lib/language";
import { z } from "zod";
import { createNotificationOnce } from "@/src/lib/notification";

const repostSchema = z.object({
  comment: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);
    const appLanguage = resolveRequestLanguage(req.headers, resolveAppLanguage(user.language));
    const { id: originalPostId } = await params;
    const body = await req.json().catch(() => ({}));
    const { comment } = repostSchema.parse(body);

    const originalPost = await prisma.post.findUnique({
      where: { id: originalPostId },
      include: { author: true },
    });

    if (!originalPost || originalPost.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: "POST_NOT_FOUND", message: "Original post not found" } },
        { status: 404 }
      );
    }

    if (!originalPost.category || originalPost.category === "forum") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REPOST", message: "Can only repost from additional features" } },
        { status: 400 }
      );
    }

    const existingRepost = await prisma.post.findFirst({
      where: {
        authorId: user.id,
        originalPostId,
        isRepost: true,
      },
    });

    if (existingRepost) {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_REPOSTED", message: "You have already reposted this" } },
        { status: 400 }
      );
    }

    const originalAuthorLabel = originalPost.isAnonymous
      ? resolveAnonymousIdentity(
          {
            anonymousName: originalPost.anonymousName,
            anonymousAvatar: originalPost.anonymousAvatar,
            authorId: originalPost.authorId,
          },
          appLanguage
        ).name
      : (originalPost.author.nickname ?? originalPost.author.userName ?? "Unknown");

    const repostContent = comment
      ? `${comment}\n\n[Reposted from @${originalAuthorLabel}]\n${originalPost.content}`
      : `[Reposted from @${originalAuthorLabel}]\n${originalPost.content}`;

    const repost = await prisma.post.create({
      data: {
        authorId: user.id,
        postType: originalPost.postType,
        content: repostContent,
        images: originalPost.images,
        tags: originalPost.tags,
        category: "forum",
        isRepost: true,
        originalPostId,
      },
    });

    await createNotificationOnce({
      userId: originalPost.authorId,
      type: "repost",
      actorId: user.id,
      postId: repost.id,
    });

    return NextResponse.json({
      success: true,
      data: { postId: repost.id },
    });
  } catch (error) {
    return handleError(error, req);
  }
}
