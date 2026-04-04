import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import {
  getLinkedEmailsForUser,
  getPrimaryEmailForUser,
  getVerifiedHkbuEmailForUser,
  serializeLinkedEmail,
} from "@/src/lib/user-emails";

export async function GET(req: NextRequest) {
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
        id: user.id,
        email: displayEmail,
        currentLoginEmail: session.loginEmail ?? displayEmail,
        linkedEmails: linkedEmails.map((item) => serializeLinkedEmail(item, primaryEmail)),
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
