import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { profileSetupSchema } from "@/src/schemas/auth.schema";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = profileSetupSchema.parse(body);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: data.nickname,
        grade: data.grade,
        major: data.major,
        gender: data.gender,
        bio: data.bio ?? "",
        language: data.language ?? "en",
        ...(data.avatar && { avatar: data.avatar }),
        ...(data.userName && { userName: data.userName }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
