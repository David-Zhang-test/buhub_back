import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { invalidateEntityTranslations } from "@/src/services/translation.service";
import { detectContentLanguage, resolveAppLanguage, resolveRequestLanguage } from "@/src/lib/language";
import {
  localizeSecondhandCondition,
  normalizeSecondhandCondition,
} from "@/src/lib/secondhand-condition";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestLanguage = resolveRequestLanguage(req.headers);
    let currentUserId: string | undefined;
    try {
      const { user } = await getCurrentUser(req);
      currentUserId = user.id;
    } catch {
      currentUserId = undefined;
    }

    const { id } = await params;
    const wantsInclude = currentUserId
      ? {
          where: { userId: currentUserId },
          select: {
            userId: true,
          },
        }
      : {
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
        };

    const item = await prisma.secondhandItem.findUnique({
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
        wants: wantsInclude,
      },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 }
      );
    }

    if (!item.expired && item.expiresAt < new Date()) {
      await prisma.secondhandItem.update({
        where: { id },
        data: { expired: true },
      });
      item.expired = true;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...item,
        condition: localizeSecondhandCondition(item.condition, requestLanguage),
        isWanted: currentUserId ? item.wants.length > 0 : false,
      },
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

    const item = await prisma.secondhandItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 }
      );
    }
    if (item.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized" } },
        { status: 403 }
      );
    }

    const updated = await prisma.secondhandItem.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.price && { price: body.price }),
        ...(body.condition !== undefined && { condition: normalizeSecondhandCondition(body.condition) }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.images !== undefined && { images: body.images }),
        ...(body.expired !== undefined && { expired: Boolean(body.expired) }),
        ...(body.expiresAt && { expiresAt: new Date(body.expiresAt) }),
        sourceLanguage: detectContentLanguage(
          [
            body.title ?? item.title,
            body.description ?? item.description,
            body.location ?? item.location,
          ],
          resolveAppLanguage(user.language)
        ),
      },
    });
    await invalidateEntityTranslations("secondhand", id);

    const requestLanguage = resolveRequestLanguage(req.headers);
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        condition: localizeSecondhandCondition(updated.condition, requestLanguage),
      },
    });
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

    const item = await prisma.secondhandItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 }
      );
    }
    if (item.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized" } },
        { status: 403 }
      );
    }

    await prisma.secondhandItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
