import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";
import bcrypt from "bcrypt";

const schema = z.object({
  password: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { password } = schema.parse(body);

    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    if (fullUser.passwordHash) {
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_ALREADY_SET", message: "Password has already been set" } },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({
      success: true,
      message: "Password set successfully",
    });
  } catch (error) {
    return handleError(error);
  }
}
