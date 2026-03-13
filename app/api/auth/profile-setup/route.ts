import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError, ValidationError } from "@/src/lib/errors";
import { redis } from "@/src/lib/redis";
import { profileSetupSchema } from "@/src/schemas/auth.schema";
import { generateProfileIdentity } from "@/src/lib/profile-identity";
import { resolveAppLanguage } from "@/src/lib/language";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = profileSetupSchema.parse(body);
    const resolvedLanguage = resolveAppLanguage(data.language, resolveAppLanguage(user.language));
    const generatedIdentity = data.autoGenerate
      ? generateProfileIdentity(user.email ?? user.id, resolvedLanguage)
      : null;
    const nickname = generatedIdentity?.nickname ?? data.nickname?.trim();

    if (!nickname) {
      throw new ValidationError("Nickname is required");
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname,
        grade: data.grade ?? "",
        major: data.major ?? "",
        gender: data.gender ?? "other",
        bio: data.bio ?? "",
        ...(data.language !== undefined && { language: data.language }),
        ...((generatedIdentity?.avatar ?? data.avatar) && { avatar: generatedIdentity?.avatar ?? data.avatar }),
        ...(data.userName && { userName: data.userName }),
      },
      select: {
        nickname: true,
        avatar: true,
        grade: true,
        major: true,
        bio: true,
        gender: true,
        language: true,
      },
    });
    await redis.del(`user:${user.id}`);

    return NextResponse.json({
      success: true,
      data: {
        nickname: updatedUser.nickname,
        avatar: updatedUser.avatar,
        grade: updatedUser.grade ?? "",
        major: updatedUser.major ?? "",
        bio: updatedUser.bio ?? "",
        gender: updatedUser.gender ?? "other",
        language: updatedUser.language === "zh-TW" ? "tc" : updatedUser.language === "zh-CN" ? "sc" : "en",
      },
    });
  } catch (error) {
    return handleError(error, req);
  }
}
