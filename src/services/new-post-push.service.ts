import { prisma } from "@/src/lib/db";
import { pushT, getUserLanguage } from "@/src/lib/push-i18n";
import { sendPushOnce, extractContentPreview } from "./expo-push.service";

interface BroadcastInput {
  postId: string;
  authorId: string;
  authorName: string;
  isAnonymous: boolean;
  contentPreview: string;
}

/**
 * Broadcast push notification to all active users when a new forum post is created.
 * Excludes the post author. Respects user notification preferences via "system" category.
 * Runs asynchronously — caller should fire-and-forget.
 */
export async function broadcastNewPostPush(input: BroadcastInput): Promise<void> {
  const { postId, authorId, isAnonymous, contentPreview } = input;

  const preview = extractContentPreview(contentPreview, 60) || "...";

  // Fetch all users with push tokens, excluding the author.
  const usersWithTokens = await prisma.user.findMany({
    where: {
      isActive: true,
      isBanned: false,
      id: { not: authorId },
      pushTokens: { some: { provider: "expo" } },
    },
    select: { id: true, language: true },
  });

  if (usersWithTokens.length === 0) return;

  // Send in batches of 50 to avoid overwhelming the event loop
  const BATCH_SIZE = 50;
  for (let i = 0; i < usersWithTokens.length; i += BATCH_SIZE) {
    const batch = usersWithTokens.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (targetUser) => {
        const lang = (targetUser.language === "tc" || targetUser.language === "sc" || targetUser.language === "en")
          ? targetUser.language
          : "tc";

        const title = pushT(lang, "new_post.title");
        const body = isAnonymous
          ? pushT(lang, "new_post.anon_body")
          : pushT(lang, "new_post.body", { actor: input.authorName, preview });

        await sendPushOnce({
          dedupeKey: `push:new_post:${postId}:${targetUser.id}`,
          userId: targetUser.id,
          title,
          body,
          category: "system",
          ttlSeconds: 24 * 60 * 60, // 24h dedup — same post won't push twice
          data: {
            type: "new_post",
            postId,
            path: `post/${postId}`,
          },
        });
      })
    );
  }
}
