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

    const errand = await prisma.errand.findUnique({
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
        accepts: {
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

    if (!errand) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Errand not found" } },
        { status: 404 }
      );
    }

    if (!errand.expired && errand.expiresAt < new Date()) {
      await prisma.errand.update({
        where: { id },
        data: { expired: true },
      });
      errand.expired = true;
    }

    return NextResponse.json({ success: true, data: errand });
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

    const errand = await prisma.errand.findUnique({ where: { id } });
    if (!errand) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Errand not found" } },
        { status: 404 }
      );
    }
    if (errand.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized" } },
        { status: 403 }
      );
    }

    const updated = await prisma.errand.update({
      where: { id },
      data: {
        ...(body.category && { category: body.category }),
        ...(body.type && { type: body.type }),
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.from && { from: body.from }),
        ...(body.to && { to: body.to }),
        ...(body.price && { price: body.price }),
        ...(body.item && { item: body.item }),
        ...(body.time && { time: body.time }),
        ...(body.expired !== undefined && { expired: Boolean(body.expired) }),
        ...(body.expiresAt && { expiresAt: new Date(body.expiresAt) }),
        sourceLanguage: detectContentLanguage(
          [
            body.title ?? errand.title,
            body.description ?? errand.description,
            body.from ?? errand.from,
            body.to ?? errand.to,
            body.item ?? errand.item,
            body.time ?? errand.time,
          ],
          resolveAppLanguage(user.language)
        ),
      },
    });
    await invalidateEntityTranslations("errand", id);

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

    const errand = await prisma.errand.findUnique({ where: { id } });
    if (!errand) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Errand not found" } },
        { status: 404 }
      );
    }
    if (errand.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Not authorized" } },
        { status: 403 }
      );
    }

    await prisma.errand.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
