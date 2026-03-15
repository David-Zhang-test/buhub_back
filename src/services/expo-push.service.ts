import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_MAX_MESSAGES_PER_REQUEST = 100;
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

function chunkArray<T>(items: T[], size: number): T[][]
{
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

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
  maxLength = 90
): string {
  const content = rawContent?.trim() ?? "";

  if (content.startsWith(MESSAGE_ALBUM_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_ALBUM_PREFIX.length)) as { count?: number };
      const count = typeof payload?.count === "number" && payload.count > 0 ? payload.count : images.length;
      return count > 1 ? `${count} photos` : "Photo";
    } catch {
      return images.length > 1 ? `${images.length} photos` : "Photo";
    }
  }

  if (content.startsWith(MESSAGE_REACTION_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_REACTION_PREFIX.length)) as { emoji?: string | null };
      return payload?.emoji?.trim() ? `Reacted ${payload.emoji.trim()}` : "";
    } catch {
      return "";
    }
  }

  if (content.startsWith(MESSAGE_AUDIO_PREFIX)) {
    return "Voice message";
  }

  if (content.startsWith(MESSAGE_CARD_PREFIX)) {
    try {
      const payload = JSON.parse(content.slice(MESSAGE_CARD_PREFIX.length)) as { type?: string; title?: string };
      const title = truncateText(payload?.title ?? "", maxLength);
      if (!title) return "Shared a card";
      return `Shared: ${title}`;
    } catch {
      return "Shared a card";
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
  if (images.length > 1) return `${images.length} photos`;
  if (images.length === 1) return "Photo";
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

  for (const batch of chunkArray(messages, EXPO_MAX_MESSAGES_PER_REQUEST)) {
    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
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
      results.forEach((result, index) => {
        if (result?.status === "ok") {
          delivered += 1;
          return;
        }

        if (result?.details?.error === "DeviceNotRegistered") {
          const token = batch[index]?.to;
          if (token) invalidTokens.add(token);
        }
      });
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

  const messages: ExpoPushMessage[] = uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: input.data,
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
