import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { invalidateEntityTranslations } from "@/src/services/translation.service";
import { detectContentLanguage, resolveAppLanguage } from "@/src/lib/language";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.partnerPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            bio: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
        joins: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatar: true,
                userName: true,
              },
            },
          },
        },
      },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }

    if (!post.expired && post.expiresAt < new Date()) {
      await prisma.partnerPost.update({
        where: { id },
        data: { expired: true },
      });
      post.expired = true;
    }

    return NextResponse.json({ success: true, data: post });
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

    const post = await prisma.partnerPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }
    if (post.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized" } },
        { status: 403 }
      );
    }

    const updated = await prisma.partnerPost.update({
      where: { id },
      data: {
        ...(body.type && { type: body.type }),
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.time && { time: body.time }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.expired !== undefined && { expired: Boolean(body.expired) }),
        ...(body.expiresAt && { expiresAt: new Date(body.expiresAt) }),
        sourceLanguage: detectContentLanguage(
          [body.title ?? post.title, body.description ?? post.description, body.time ?? post.time, body.location ?? post.location],
          resolveAppLanguage(user.language)
        ),
      },
    });
    await invalidateEntityTranslations("partner", id);

    return NextResponse.json({ success: true, data: updated });
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

    const post = await prisma.partnerPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Post not found" } },
        { status: 404 }
      );
    }
    if (post.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized" } },
        { status: 403 }
      );
    }

    await prisma.partnerPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
