import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { prisma } from "@/src/lib/db";
import { z } from "zod";

const settingsSchema = z.object({
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  followers: z.boolean().optional(),
  messages: z.boolean().optional(),
  system: z.boolean().optional(),
});

type NotificationSettingsRow = {
  likes: boolean;
  comments: boolean;
  followers: boolean;
  messages: boolean;
  system: boolean;
};

const DEFAULT_SETTINGS: NotificationSettingsRow = {
  likes: true,
  comments: true,
  followers: true,
  messages: true,
  system: true,
};

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const [settings] = await prisma.$queryRaw<NotificationSettingsRow[]>`
      SELECT "likes", "comments", "followers", "messages", "system"
      FROM "NotificationPreference"
      WHERE "userId" = ${user.id}
      LIMIT 1
    `;

    return NextResponse.json({
      success: true,
      data: settings ?? DEFAULT_SETTINGS,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const settings = settingsSchema.parse(body);

    const updatedLikes = settings.likes ?? DEFAULT_SETTINGS.likes;
    const updatedComments = settings.comments ?? DEFAULT_SETTINGS.comments;
    const updatedFollowers = settings.followers ?? DEFAULT_SETTINGS.followers;
    const updatedMessages = settings.messages ?? DEFAULT_SETTINGS.messages;
    const updatedSystem = settings.system ?? DEFAULT_SETTINGS.system;

    const [updated] = await prisma.$queryRaw<NotificationSettingsRow[]>`
      INSERT INTO "NotificationPreference" (
        "id",
        "userId",
        "likes",
        "comments",
        "followers",
        "messages",
        "system",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${user.id},
        ${updatedLikes},
        ${updatedComments},
        ${updatedFollowers},
        ${updatedMessages},
        ${updatedSystem},
        NOW(),
        NOW()
      )
      ON CONFLICT ("userId") DO UPDATE SET
        "likes" = COALESCE(${settings.likes}, "NotificationPreference"."likes"),
        "comments" = COALESCE(${settings.comments}, "NotificationPreference"."comments"),
        "followers" = COALESCE(${settings.followers}, "NotificationPreference"."followers"),
        "messages" = COALESCE(${settings.messages}, "NotificationPreference"."messages"),
        "system" = COALESCE(${settings.system}, "NotificationPreference"."system"),
        "updatedAt" = NOW()
      RETURNING "likes", "comments", "followers", "messages", "system"
    `;

    return NextResponse.json({
      success: true,
      data: updated ?? DEFAULT_SETTINGS,
    });
  } catch (error) {
    return handleError(error);
  }
}
