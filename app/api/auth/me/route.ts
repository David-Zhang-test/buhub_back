import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function GET(req: NextRequest) {
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
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        language,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
