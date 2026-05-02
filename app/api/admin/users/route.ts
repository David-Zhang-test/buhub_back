import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcrypt";
import { authService } from "@/src/services/auth.service";
import {
  createUserEmail,
  USER_EMAIL_TYPE_HKBU,
  USER_EMAIL_TYPE_PRIMARY,
  normalizeEmail,
  isEmailLinked,
} from "@/src/lib/user-emails";
import { isLifeHkbuEmail } from "@/src/lib/email-domain";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["USER", "ADMIN", "MODERATOR"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;
    const q = searchParams.get("q") || "";
    const roleParam = searchParams.get("role");
    const banned = searchParams.get("banned");

    const where: Prisma.UserWhereInput = {};
    if (q && q.length >= 1) {
      where.OR = [
        { nickname: { contains: q, mode: "insensitive" as const } },
        { userName: { contains: q, mode: "insensitive" as const } },
        { emails: { some: { email: { contains: q, mode: "insensitive" as const } } } },
      ];
    }
    if (roleParam && ["USER", "ADMIN", "MODERATOR"].includes(roleParam)) {
      where.role = roleParam as Role;
    }
    if (banned === "true") where.isBanned = true;
    if (banned === "false") where.isBanned = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          emails: { select: { email: true, type: true } },
          userName: true,
          nickname: true,
          avatar: true,
          role: true,
          isActive: true,
          isBanned: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((u) => ({
      ...u,
      email: u.emails[0]?.email || null,
    }));

    return NextResponse.json({ success: true, data: formattedUsers, total });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const body = await req.json();
    const data = createUserSchema.parse(body);
    const email = normalizeEmail(data.email);

    if (await isEmailLinked(email)) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_EXISTS", message: "Email already registered" } },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const { nickname, avatar } = await authService.generateRandomProfile(email, "en");
    const userName = `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          passwordHash,
          userName,
          nickname,
          avatar,
          role: data.role ?? "USER",
          agreedToTerms: true,
          agreedToTermsAt: new Date(),
          accounts: {
            create: {
              type: "email",
              provider: "email",
              providerAccountId: email,
            },
          },
        },
        select: {
          id: true,
          userName: true,
          nickname: true,
          avatar: true,
          role: true,
          isActive: true,
          isBanned: true,
          createdAt: true,
          lastLoginAt: true,
        },
      });

      const userEmail = await createUserEmail(tx, {
        userId: user.id,
        email,
        type: isLifeHkbuEmail(email) ? USER_EMAIL_TYPE_HKBU : USER_EMAIL_TYPE_PRIMARY,
        canLogin: true,
        verifiedAt: new Date(),
      });

      return { ...user, email: userEmail.email };
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
