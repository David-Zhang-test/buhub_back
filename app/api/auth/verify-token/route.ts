import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    return NextResponse.json({
      valid: true,
      user: {
        name: user.userName ?? user.nickname,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
        defaultAvatar: user.defaultAvatar ?? null,
        grade: user.grade ?? "",
        major: user.major ?? "",
        bio: user.bio ?? "",
        gender: user.gender ?? "other",
        isLoggedIn: true,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
