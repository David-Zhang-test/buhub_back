const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const MENTION_REGEX = /(^|[^A-Za-z0-9_@])[@＠]([A-Za-z0-9_]{2,30})/g;

function extractMentionHandles(content) {
  if (!content) return [];
  const dedupedByLower = new Map();
  MENTION_REGEX.lastIndex = 0;
  let match = MENTION_REGEX.exec(content);
  while (match) {
    const raw = (match[2] || "").trim();
    if (raw) {
      const normalized = raw.toLowerCase();
      if (!dedupedByLower.has(normalized)) {
        dedupedByLower.set(normalized, raw);
      }
    }
    match = MENTION_REGEX.exec(content);
  }
  return Array.from(dedupedByLower.values());
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const stats = {
    commentsScanned: 0,
    commentsWithMentions: 0,
    mentionCandidates: 0,
    skippedSelf: 0,
    skippedPrimaryNotifyTarget: 0,
    skippedExisting: 0,
    created: 0,
  };

  const comments = await prisma.comment.findMany({
    where: {
      isDeleted: false,
      content: { contains: "@" },
      post: { isDeleted: false },
    },
    select: {
      id: true,
      postId: true,
      authorId: true,
      parentId: true,
      content: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  stats.commentsScanned = comments.length;
  if (comments.length === 0) {
    console.log(
      JSON.stringify(
        {
          ...stats,
          note: "No historical comments with @ found. Nothing to backfill.",
        },
        null,
        2
      )
    );
    return;
  }

  const postIds = Array.from(new Set(comments.map((c) => c.postId)));
  const parentIds = Array.from(
    new Set(comments.map((c) => c.parentId).filter(Boolean))
  );

  const [posts, parentComments] = await Promise.all([
    prisma.post.findMany({
      where: { id: { in: postIds }, isDeleted: false },
      select: { id: true, authorId: true },
    }),
    parentIds.length
      ? prisma.comment.findMany({
          where: { id: { in: parentIds }, isDeleted: false },
          select: { id: true, authorId: true },
        })
      : Promise.resolve([]),
  ]);

  const postAuthorById = new Map(posts.map((p) => [p.id, p.authorId]));
  const parentAuthorById = new Map(
    parentComments.map((c) => [c.id, c.authorId])
  );

  const mentionHandlesByCommentId = new Map();
  const allHandles = new Set();

  for (const comment of comments) {
    const handles = extractMentionHandles(comment.content);
    if (handles.length === 0) continue;
    mentionHandlesByCommentId.set(comment.id, handles);
    stats.commentsWithMentions += 1;
    handles.forEach((h) => allHandles.add(h));
  }

  if (allHandles.size === 0) {
    console.log(
      JSON.stringify(
        {
          ...stats,
          note: "Comments contain @ but no valid handles were parsed.",
        },
        null,
        2
      )
    );
    return;
  }

  const handles = Array.from(allHandles);
  const mentionLookupConditions = handles.flatMap((handle) => [
    { userName: { equals: handle, mode: "insensitive" } },
    { nickname: { equals: handle, mode: "insensitive" } },
  ]);
  const users = mentionLookupConditions.length
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          isBanned: false,
          OR: mentionLookupConditions,
        },
        select: { id: true, userName: true, nickname: true },
      })
    : [];

  const handlesByLower = new Map();
  for (const handle of handles) {
    const normalized = handle.toLowerCase();
    if (!handlesByLower.has(normalized)) {
      handlesByLower.set(normalized, new Set());
    }
    handlesByLower.get(normalized).add(handle);
  }
  const userIdsByHandle = new Map();
  for (const user of users) {
    if (user.userName) {
      const matchedHandles = handlesByLower.get(user.userName.toLowerCase());
      if (matchedHandles) {
        matchedHandles.forEach((handle) => {
          const existing = userIdsByHandle.get(handle) || new Set();
          existing.add(user.id);
          userIdsByHandle.set(handle, existing);
        });
      }
    }
    if (user.nickname) {
      const matchedHandles = handlesByLower.get(user.nickname.toLowerCase());
      if (matchedHandles) {
        matchedHandles.forEach((handle) => {
          const existing = userIdsByHandle.get(handle) || new Set();
          existing.add(user.id);
          userIdsByHandle.set(handle, existing);
        });
      }
    }
  }

  const commentIds = comments.map((c) => c.id);
  const existingMentionRows = await prisma.notification.findMany({
    where: {
      type: "mention",
      commentId: { in: commentIds },
    },
    select: { commentId: true, userId: true },
  });
  const existingMentionSet = new Set(
    existingMentionRows
      .filter((n) => n.commentId && n.userId)
      .map((n) => `${n.commentId}:${n.userId}`)
  );

  const toCreate = [];

  for (const comment of comments) {
    const handlesForComment = mentionHandlesByCommentId.get(comment.id) || [];
    if (handlesForComment.length === 0) continue;

    const notifyUserId = comment.parentId
      ? parentAuthorById.get(comment.parentId) || postAuthorById.get(comment.postId)
      : postAuthorById.get(comment.postId);

    const targetUserIds = new Set();
    for (const handle of handlesForComment) {
      const matchedUserIds = userIdsByHandle.get(handle);
      if (!matchedUserIds) continue;
      matchedUserIds.forEach((id) => targetUserIds.add(id));
    }

    targetUserIds.forEach((mentionedUserId) => {
      stats.mentionCandidates += 1;
      if (mentionedUserId === comment.authorId) {
        stats.skippedSelf += 1;
        return;
      }
      if (notifyUserId && mentionedUserId === notifyUserId) {
        stats.skippedPrimaryNotifyTarget += 1;
        return;
      }
      const dedupeKey = `${comment.id}:${mentionedUserId}`;
      if (existingMentionSet.has(dedupeKey)) {
        stats.skippedExisting += 1;
        return;
      }

      toCreate.push({
        userId: mentionedUserId,
        type: "mention",
        actorId: comment.authorId,
        postId: comment.postId,
        commentId: comment.id,
        createdAt: comment.createdAt,
      });
      existingMentionSet.add(dedupeKey);
    });
  }

  if (toCreate.length > 0) {
    const chunks = chunkArray(toCreate, 500);
    for (const chunk of chunks) {
      await prisma.notification.createMany({ data: chunk });
      stats.created += chunk.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        ...stats,
        note:
          stats.created > 0
            ? "Backfill completed."
            : "Backfill completed. No new mention notifications were needed.",
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("MENTION_BACKFILL_FAILED");
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
