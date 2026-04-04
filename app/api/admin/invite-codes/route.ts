import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { createInviteCodesForUser } from "@/src/lib/invite-codes";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const createInviteCodesSchema = z.object({
  ownerUserId: z.string().min(1),
  count: z.number().int().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 100);
    const skip = (page - 1) * limit;
    const q = (searchParams.get("q") || "").trim();
    const status = searchParams.get("status") || "all";

    const where: Prisma.InviteCodeWhereInput = {};

    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" as const } },
        { ownerUser: { nickname: { contains: q, mode: "insensitive" as const } } },
        { ownerUser: { userName: { contains: q, mode: "insensitive" as const } } },
        {
          ownerUser: {
            emails: { some: { email: { contains: q, mode: "insensitive" as const } } },
          },
        },
        { usedByUser: { nickname: { contains: q, mode: "insensitive" as const } } },
        { usedByUser: { userName: { contains: q, mode: "insensitive" as const } } },
        {
          usedByUser: {
            emails: { some: { email: { contains: q, mode: "insensitive" as const } } },
          },
        },
      ];
    }

    if (status === "used") where.usedByUserId = { not: null };
    if (status === "unused") where.usedByUserId = null;

    const [inviteCodes, total] = await Promise.all([
      prisma.inviteCode.findMany({
        where,
        select: {
          id: true,
          code: true,
          createdAt: true,
          usedAt: true,
          ownerUser: {
            select: {
              id: true,
              nickname: true,
              userName: true,
              emails: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { email: true },
              },
            },
          },
          usedByUser: {
            select: {
              id: true,
              nickname: true,
              userName: true,
              emails: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { email: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.inviteCode.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: inviteCodes.map((item) => ({
        id: item.id,
        code: item.code,
        createdAt: item.createdAt,
        usedAt: item.usedAt,
        status: item.usedAt ? "used" : "unused",
        owner: item.ownerUser
          ? {
              id: item.ownerUser.id,
              nickname: item.ownerUser.nickname,
              userName: item.ownerUser.userName,
              email: item.ownerUser.emails[0]?.email ?? null,
            }
          : null,
        usedBy: item.usedByUser
          ? {
              id: item.usedByUser.id,
              nickname: item.usedByUser.nickname,
              userName: item.usedByUser.userName,
              email: item.usedByUser.emails[0]?.email ?? null,
            }
          : null,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");
    const body = await req.json();
    const { ownerUserId, count } = createInviteCodesSchema.parse(body);

    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "OWNER_NOT_FOUND", message: "Owner user not found" },
        },
        { status: 404 }
      );
    }

    const amount = count ?? 1;
    const createdCodes = await prisma.$transaction(async (tx) =>
      createInviteCodesForUser(tx, ownerUserId, amount)
    );

    return NextResponse.json({
      success: true,
      data: {
        count: createdCodes.length,
        codes: createdCodes,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
