import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const language =
      user.language === "zh-TW"
        ? "tc"
        : user.language === "zh-CN"
          ? "sc"
          : user.language ?? "en";

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        user: {
          id: user.id,
          name: user.name ?? user.userName ?? user.nickname,
          nickname: user.nickname,
          email: user.email ?? "",
          avatar: user.avatar,
          grade: user.grade ?? "",
          major: user.major ?? "",
          bio: user.bio ?? "",
          gender: user.gender ?? "other",
          language,
          userName: user.userName,
          role: user.role,
          isLoggedIn: true,
        },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
