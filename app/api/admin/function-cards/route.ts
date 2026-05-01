import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";

const TYPES = ["partner", "errand", "secondhand"] as const;
type CardType = (typeof TYPES)[number];

type CardAuthor = {
  id: string;
  nickname: string | null;
  userName: string | null;
  avatar: string | null;
  role: string;
};

type CardRow = {
  type: CardType;
  id: string;
  title: string;
  description: string;
  category: string;
  subType: string;
  meta: Record<string, unknown>;
  expired: boolean;
  expiresAt: Date;
  createdAt: Date;
  author: CardAuthor | null;
};

type Bucket = { type: CardType; total: number; rows: CardRow[] };

const AUTHOR_SELECT = {
  id: true,
  nickname: true,
  userName: true,
  avatar: true,
  role: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const typeParam = (searchParams.get("type") || "all").toLowerCase();
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const includeExpired = searchParams.get("includeExpired") === "true";
    const skip = (page - 1) * limit;

    const targets: CardType[] =
      typeParam === "all"
        ? [...TYPES]
        : TYPES.includes(typeParam as CardType)
        ? [typeParam as CardType]
        : [];

    if (targets.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TYPE", message: "Unknown card type" } },
        { status: 400 }
      );
    }

    const expiredFilter = includeExpired ? {} : { expired: false };

    const buckets: Bucket[] = await Promise.all(
      targets.map(async (t): Promise<Bucket> => {
        if (t === "partner") {
          const [rows, total] = await Promise.all([
            prisma.partnerPost.findMany({
              where: expiredFilter,
              include: { author: { select: AUTHOR_SELECT } },
              orderBy: { createdAt: "desc" },
              skip: targets.length === 1 ? skip : 0,
              take: limit,
            }),
            prisma.partnerPost.count({ where: expiredFilter }),
          ]);
          return {
            type: t,
            total,
            rows: rows.map((r) => ({
              type: "partner" as const,
              id: r.id,
              title: r.title,
              description: r.description,
              category: r.category,
              subType: r.type,
              meta: { time: r.time, location: r.location },
              expired: r.expired,
              expiresAt: r.expiresAt,
              createdAt: r.createdAt,
              author: r.author,
            })),
          };
        }
        if (t === "errand") {
          const [rows, total] = await Promise.all([
            prisma.errand.findMany({
              where: expiredFilter,
              include: { author: { select: AUTHOR_SELECT } },
              orderBy: { createdAt: "desc" },
              skip: targets.length === 1 ? skip : 0,
              take: limit,
            }),
            prisma.errand.count({ where: expiredFilter }),
          ]);
          return {
            type: t,
            total,
            rows: rows.map((r) => ({
              type: "errand" as const,
              id: r.id,
              title: r.title,
              description: r.description,
              category: r.category,
              subType: r.type,
              meta: { from: r.from, to: r.to, price: r.price, item: r.item, time: r.time },
              expired: r.expired,
              expiresAt: r.expiresAt,
              createdAt: r.createdAt,
              author: r.author,
            })),
          };
        }
        const where = includeExpired ? {} : { expired: false };
        const [rows, total] = await Promise.all([
          prisma.secondhandItem.findMany({
            where,
            include: { author: { select: AUTHOR_SELECT } },
            orderBy: { createdAt: "desc" },
            skip: targets.length === 1 ? skip : 0,
            take: limit,
          }),
          prisma.secondhandItem.count({ where }),
        ]);
        return {
          type: "secondhand" as const,
          total,
          rows: rows.map((r) => ({
            type: "secondhand" as const,
            id: r.id,
            title: r.title,
            description: r.description,
            category: r.category,
            subType: r.type,
            meta: {
              price: r.price,
              condition: r.condition,
              location: r.location,
              sold: r.sold,
              images: r.images,
            },
            expired: r.expired,
            expiresAt: r.expiresAt,
            createdAt: r.createdAt,
            author: r.author,
          })),
        };
      })
    );

    if (targets.length === 1) {
      const only = buckets[0];
      return NextResponse.json({
        success: true,
        data: only.rows,
        total: only.total,
        type: only.type,
      });
    }

    const merged = buckets
      .flatMap((b) => b.rows)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const totals = Object.fromEntries(buckets.map((b) => [b.type, b.total]));
    return NextResponse.json({
      success: true,
      data: merged,
      total: buckets.reduce((s, b) => s + b.total, 0),
      totals,
    });
  } catch (error) {
    return handleError(error);
  }
}
