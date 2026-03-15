import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { getLinkedEmailsForUser, getVerifiedHkbuEmailForUser, serializeLinkedEmail } from "@/src/lib/user-emails";

export async function GET(req: NextRequest) {
  try {
    const { user, session } = await getCurrentUser(req);
    const [linkedEmails, hkbuEmailRecord] = await Promise.all([
      getLinkedEmailsForUser(user.id),
      getVerifiedHkbuEmailForUser(user.id),
    ]);
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
        currentLoginEmail: session.loginEmail ?? user.email,
        linkedEmails: linkedEmails.map((item) => serializeLinkedEmail(item, user.email)),
        isHKBUVerified: Boolean(hkbuEmailRecord),
        hkbuEmail: hkbuEmailRecord?.email,
        nickname: user.nickname,
        avatar: user.avatar,
        language,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
