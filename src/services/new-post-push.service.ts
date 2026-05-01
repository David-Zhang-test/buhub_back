import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { resolveAppLanguage, type AppLanguage } from "@/src/lib/language";
import { pushT, getUserLanguage } from "@/src/lib/push-i18n";
import {
  extractContentPreview,
  sendBatchedExpoMessages,
  type ExpoPushMessage,
} from "./expo-push.service";

interface BroadcastInput {
  postId: string;
  authorId: string;
  authorName: string;
  isAnonymous: boolean;
  contentPreview: string;
}

const BROADCAST_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

type EligibleRow = {
  userId: string;
  token: string;
  language: string | null;
};

async function fetchEligibleBroadcastTokens(excludeAuthorId: string): Promise<EligibleRow[]> {
  // Single SQL JOIN: User × PushToken × NotificationPreference (LEFT JOIN, default ON).
  // Excludes author + banned/inactive + users who turned off the "system" preference.
  return prisma.$queryRaw<EligibleRow[]>`
    SELECT pt."userId", pt."token", u."language"
    FROM "PushToken" pt
    JOIN "User" u ON u."id" = pt."userId"
    LEFT JOIN "NotificationPreference" np ON np."userId" = pt."userId"
    WHERE pt."provider" = 'expo'
      AND pt."platform" IN ('ios', 'android')
      AND u."isActive" = true
      AND u."isBanned" = false
      AND u."id" <> ${excludeAuthorId}
      AND COALESCE(np."system", true) = true
  `;
}

/**
 * Broadcast push notification to all active users when a new forum post is
 * created. Excludes the post author and users with "system" preference off.
 * Per-language localized title/body. Single 24h dedupe key on the post itself
 * — re-publishing the same post will not re-broadcast.
 *
 * Single SQL query + batched Expo POSTs (100 tokens/POST). 1k users typically
 * completes in <5s vs ~30s in the previous per-user serial loop.
 */
export async function broadcastNewPostPush(input: BroadcastInput): Promise<void> {
  const { postId, authorId, isAnonymous, contentPreview, authorName } = input;
  const preview = extractContentPreview(contentPreview, 60) || "...";

  // Per-post dedupe — re-publish guard. Caller is fire-and-forget so this
  // makes retries safe.
  try {
    const wasSet = await redis.set(
      `push:new_post:${postId}`,
      "1",
      "EX",
      BROADCAST_DEDUPE_TTL_SECONDS,
      "NX"
    );
    if (wasSet !== "OK") return;
  } catch {
    // Continue without dedupe if Redis unavailable — same compromise as
    // sendPushOnce.
  }

  const rows = await fetchEligibleBroadcastTokens(authorId);
  if (rows.length === 0) return;

  // Group tokens by recipient language so we can localize once per language
  // instead of per token.
  const tokensByLang: Record<AppLanguage, string[]> = { tc: [], sc: [], en: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.token || seen.has(row.token)) continue;
    seen.add(row.token);
    const lang = resolveAppLanguage(row.language);
    tokensByLang[lang].push(row.token);
  }

  const messages: ExpoPushMessage[] = [];
  for (const lang of ["tc", "sc", "en"] as AppLanguage[]) {
    const langTokens = tokensByLang[lang];
    if (langTokens.length === 0) continue;
    const title = pushT(lang, "new_post.title");
    const body = isAnonymous
      ? pushT(lang, "new_post.anon_body")
      : pushT(lang, "new_post.body", { actor: authorName, preview });
    for (const token of langTokens) {
      messages.push({
        to: token,
        sound: "default",
        title,
        body,
        data: {
          type: "new_post",
          postId,
          path: `post/${postId}`,
        },
      });
    }
  }

  await sendBatchedExpoMessages(messages);
}

// Kept exported for potential external callers; falls back to user.language
// when caller doesn't already know the recipient's language.
export { getUserLanguage };
