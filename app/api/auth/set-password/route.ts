import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";
import bcrypt from "bcrypt";
import { assertStrongPassword } from "@/src/schemas/auth.schema";

const setPasswordSchema = z.object({
  password: z.string().max(100),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { password } = setPasswordSchema.parse(body);
    assertStrongPassword(password);

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
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
