import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import {
  getLinkedEmailsForUser,
  getPrimaryEmailForUser,
  getVerifiedHkbuEmailForUser,
  serializeLinkedEmail,
} from "@/src/lib/user-emails";

export async function POST(req: NextRequest) {
  try {
    const { user, session } = await getCurrentUser(req);
    const [linkedEmails, hkbuEmailRecord, primaryEmail] = await Promise.all([
      getLinkedEmailsForUser(user.id),
      getVerifiedHkbuEmailForUser(user.id),
      getPrimaryEmailForUser(user.id),
    ]);
    const displayEmail = primaryEmail ?? "";
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
          email: displayEmail,
          currentLoginEmail: session.loginEmail ?? displayEmail,
          avatar: user.avatar,
          grade: user.grade ?? "",
          major: user.major ?? "",
          bio: user.bio ?? "",
          gender: user.gender ?? "other",
          language,
          userName: user.userName,
          role: user.role,
          linkedEmails: linkedEmails.map((item) => serializeLinkedEmail(item, primaryEmail)),
          isHKBUVerified: Boolean(hkbuEmailRecord),
          hkbuEmail: hkbuEmailRecord?.email,
          isLoggedIn: true,
        },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
