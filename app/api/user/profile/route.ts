import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { redis } from "@/src/lib/redis";
import { getLinkedEmailsForUser, getVerifiedHkbuEmailForUser, serializeLinkedEmail } from "@/src/lib/user-emails";
import { updateProfileSchema } from "@/src/schemas/user.schema";

export async function GET(req: NextRequest) {
  try {
    const { user, session } = await getCurrentUser(req);

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        avatar: true,
        grade: true,
        major: true,
        bio: true,
        gender: true,
        language: true,
        userName: true,
        emailVerified: true,
      },
    });

    if (!fullUser) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    const [linkedEmails, hkbuEmailRecord] = await Promise.all([
      getLinkedEmailsForUser(fullUser.id),
      getVerifiedHkbuEmailForUser(fullUser.id),
    ]);

    const lang = fullUser.language === "zh-TW" ? "tc" : fullUser.language === "zh-CN" ? "sc" : fullUser.language ?? "en";
    return NextResponse.json({
      success: true,
      data: {
        id: fullUser.id,
        name: fullUser.name ?? fullUser.nickname,
        nickname: fullUser.nickname,
        email: fullUser.email ?? "",
        currentLoginEmail: session.loginEmail ?? fullUser.email ?? "",
        avatar: fullUser.avatar || null,
        grade: fullUser.grade ?? "",
        major: fullUser.major ?? "",
        bio: fullUser.bio ?? "",
        gender: fullUser.gender as "male" | "female" | "other" | "secret",
        language: lang,
        isLoggedIn: true,
        linkedEmails: linkedEmails.map((item) => serializeLinkedEmail(item, fullUser.email)),
        isHKBUVerified: Boolean(hkbuEmailRecord),
        hkbuEmail: hkbuEmailRecord?.email,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = updateProfileSchema.parse(body);

    const lang = data.language === "tc" ? "zh-TW" : data.language === "sc" ? "zh-CN" : data.language;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.nickname !== undefined && { nickname: data.nickname }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        ...(data.grade !== undefined && { grade: data.grade }),
        ...(data.major !== undefined && { major: data.major }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(lang !== undefined && { language: lang }),
      },
    });
    await redis.del(`user:${user.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
