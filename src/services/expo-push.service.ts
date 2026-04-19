import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import type { AppLanguage } from "@/src/lib/language";
import { pushT } from "@/src/lib/push-i18n";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_DEDUPE_GRACE_SECONDS = 3 * 24 * 60 * 60;
const FUNCTION_REF_PREFIX = "[FUNC_REF]";
const MESSAGE_CARD_PREFIX = "[BUHUB_CARD]";
const MESSAGE_REPLY_PREFIX = "[BUHUB_REPLY]";
const MESSAGE_AUDIO_PREFIX = "[BUHUB_AUDIO]";
const MESSAGE_REACTION_PREFIX = "[BUHUB_REACTION]";
const MESSAGE_ALBUM_PREFIX = "[BUHUB_ALBUM]";

type PushDataValue = string | number | boolean | null;

export type PushPayloadData = Record<string, PushDataValue>;
export type PushPreferenceKey = "likes" | "comments" | "followers" | "messages" | "system";

type ExpoPushMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data?: PushPayloadData;
  badge?: number;
};

type PushSendResult = {
  attempted: number;
  delivered: number;
  skippedPreference?: boolean;
};

type NotificationSettingsRow = {
  likes: boolean;
  comments: boolean;
  followers: boolean;
  messages: boolean;
  system: boolean;
};

function normalizePushTitle(title: string): string {
  return title.trim().slice(0, 120);
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function getActorDisplayName(input: { nickname?: string | null; userName?: string | null }): string {
  return input.nickname?.trim() || input.userName?.trim() || "Someone";
}

export function extractContentPreview(rawContent: string | null | undefined, maxLength = 90): string {
  if (!rawContent) return "";

  let content = rawContent.trim();
  if (!content) return "";

  if (content.startsWith(FUNCTION_REF_PREFIX)) {
    const newlineIndex = content.indexOf("\n");
    content = newlineIndex >= 0 ? content.slice(newlineIndex + 1).trim() : "";
  }

  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return truncateText(firstNonEmptyLine ?? content, maxLength);
}

export function buildDirectMessagePushPreview(
  rawContent: string | null | undefined,
  images: string[] = [],
  maxLength = 90,
  lang: AppLanguage = "tc",
): string {
  const content = rawContent?.trim() ?? "";

  if (content.startsWith(MESSAGE_ALBUM_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_ALBUM_PREFIX.length)) as { count?: number };
      const count = typeof payload?.count === "number" && payload.count > 0 ? payload.count : images.length;
      return count > 1 ? pushT(lang, "msg.photos", { count }) : pushT(lang, "msg.photo");
    } catch {
      return images.length > 1 ? pushT(lang, "msg.photos", { count: images.length }) : pushT(lang, "msg.photo");
    }
  }

  if (content.startsWith(MESSAGE_REACTION_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_REACTION_PREFIX.length)) as { emoji?: string | null };
      return payload?.emoji?.trim() ? pushT(lang, "msg.reaction", { emoji: payload.emoji.trim() }) : "";
    } catch {
      return "";
    }
  }

  if (content.startsWith(MESSAGE_AUDIO_PREFIX)) {
    return pushT(lang, "msg.voice");
  }

  if (content.startsWith(MESSAGE_CARD_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_CARD_PREFIX.length)) as { type?: string; title?: string };
      const title = truncateText(payload?.title ?? "", maxLength);
      if (!title) return pushT(lang, "msg.card");
      return pushT(lang, "msg.card.title", { title });
    } catch {
      return pushT(lang, "msg.card");
    }
  }

  if (content.startsWith(MESSAGE_REPLY_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_REPLY_PREFIX.length)) as { text?: string };
      const text = extractContentPreview(payload?.text, maxLength);
      if (text) return text;
    } catch {
      // Fall back below.
    }
  }

  const textPreview = extractContentPreview(content, maxLength);
  if (textPreview) return textPreview;
  if (images.length > 1) return pushT(lang, "msg.photos", { count: images.length });
  if (images.length === 1) return pushT(lang, "msg.photo");
  return "";
}

function resolvePushCategory(input: { category?: PushPreferenceKey; data?: PushPayloadData }): PushPreferenceKey | null {
  if (input.category) return input.category;

  const eventType = typeof input.data?.type === "string" ? input.data.type : "";
  switch (eventType) {
    case "like":
    case "bookmark":
      return "likes";
    case "comment":
    case "reply":
    case "mention":
      return "comments";
    case "follow":
      return "followers";
    case "message":
      return "messages";
    case "task_expiring_soon":
    case "task_expired":
      return "system";
    default:
      return null;
  }
}

async function isPushEnabledForUser(userId: string, category: PushPreferenceKey | null): Promise<boolean> {
  if (!category) return true;

  const [preference] = await prisma.$queryRaw<NotificationSettingsRow[]>`
    SELECT "likes", "comments", "followers", "messages", "system"
    FROM "NotificationPreference"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  if (!preference) return true;
  return preference[category];
}

async function removeInvalidExpoTokens(tokens: string[]) {
  if (tokens.length === 0) return;

  await prisma.pushToken.deleteMany({
    where: {
      provider: "expo",
      token: { in: tokens },
    },
  });
}

async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  if (messages.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  let delivered = 0;
  const invalidTokens = new Set<string>();

  // One HTTP request per message: Expo rejects batches that mix tokens from different
  // Expo projects (e.g. same user registered devices from buhub-rn and ulink-rn).
  for (const message of messages) {
    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify([message]),
        cache: "no-store",
      });

      if (!response.ok) {
        console.error("[expo-push] send failed", response.status, await response.text());
        continue;
      }

      const payload = (await response.json()) as {
        data?: Array<{ status?: string; details?: { error?: string } }>;
      };

      const results = Array.isArray(payload.data) ? payload.data : [];
      const result = results[0];
      if (result?.status === "ok") {
        delivered += 1;
      } else if (result?.details?.error === "DeviceNotRegistered" && message.to) {
        invalidTokens.add(message.to);
      }
    } catch (error) {
      console.error("[expo-push] unexpected send error", error);
    }
  }

  if (invalidTokens.size > 0) {
    await removeInvalidExpoTokens(Array.from(invalidTokens));
  }

  return {
    attempted: messages.length,
    delivered,
  };
}

async function getUnreadBadgeCount(userId: string): Promise<number> {
  try {
    const [row] = await prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int AS "count"
      FROM "Notification"
      WHERE "userId" = ${userId} AND "isRead" = false
    `;
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function sendPushToUser(input: {
  userId: string;
  title: string;
  body: string;
  data?: PushPayloadData;
  category?: PushPreferenceKey;
}): Promise<PushSendResult> {
  const category = resolvePushCategory(input);
  const enabled = await isPushEnabledForUser(input.userId, category);
  if (!enabled) {
    return { attempted: 0, delivered: 0, skippedPreference: true };
  }

  const tokens = await prisma.pushToken.findMany({
    where: {
      userId: input.userId,
      provider: "expo",
      platform: { in: ["ios", "android"] },
    },
    select: { token: true },
  });

  const uniqueTokens = Array.from(new Set(tokens.map((entry) => entry.token).filter(Boolean)));
  if (uniqueTokens.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  const title = normalizePushTitle(input.title);
  const body = truncateText(input.body, 240);
  if (!title || !body) {
    return { attempted: 0, delivered: 0 };
  }

  const badgeCount = await getUnreadBadgeCount(input.userId);

  const messages: ExpoPushMessage[] = uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: input.data,
    badge: badgeCount,
  }));

  return sendExpoPushMessages(messages);
}

export async function sendPushOnce(input: {
  dedupeKey: string;
  userId: string;
  title: string;
  body: string;
  data?: PushPayloadData;
  ttlSeconds?: number;
  category?: PushPreferenceKey;
}) {
  const ttlSeconds = Math.max(60, input.ttlSeconds ?? PUSH_DEDUPE_GRACE_SECONDS);

  try {
    const wasSet = await redis.set(input.dedupeKey, "1", "EX", ttlSeconds, "NX");
    if (wasSet !== "OK") {
      return { attempted: 0, delivered: 0, skipped: true };
    }
  } catch (error) {
    console.error("[expo-push] dedupe failed, continuing without redis guarantee", error);
  }

  const result = await sendPushToUser({
    userId: input.userId,
    title: input.title,
    body: input.body,
    data: input.data,
    category: input.category,
  });

  return {
    ...result,
    skipped: false,
  };
}
