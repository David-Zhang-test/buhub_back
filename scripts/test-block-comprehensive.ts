/**
 * End-to-end runtime check for the blocking feature.
 *
 * Covers everything added or hardened in the recent session:
 *  - Symmetric block helper (getBlockedUserIds).
 *  - Tier B GET filters: post comments, partner / errand / secondhand,
 *    notifications (likes / comments / followers).
 *  - Anon-visibility policy: identified-from-blocked → hidden,
 *    anon-from-blocked → visible (forum feed, post comments).
 *  - Conversation list filter (getConversations).
 *  - Repost embed stripping (forum feed quotedPost).
 *  - DM-forward gate (BLOCKED_FORWARD on [FUNC_REF] forwards).
 *  - Follow gate (BLOCKED on POST /api/follow).
 *  - Bidirectional symmetry on every surface.
 *
 * Replays each route's actual filter/gate logic against the real local DB.
 * Cleans up everything it creates.
 */
import { PrismaClient } from "@prisma/client";
import { getBlockedUserIds } from "@/src/lib/blocks";
import { getFunctionRefAuthorId } from "@/src/lib/function-ref";

const ALICE = "3dffbbf9-4967-4c7e-9874-67d08ba8e88d";
const HOST_USERNAME = "block_test_host_tmp";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function ensureHost(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { userName: HOST_USERNAME }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.user.create({
    data: { userName: HOST_USERNAME, nickname: "BlockTestHost", avatar: "", gender: "other", isActive: true, isBanned: false, role: "USER" },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  console.log("=== Comprehensive blocking-feature runtime check ===\n");
  const hostId = await ensureHost();
  console.log(`Host id: ${hostId}\nAlice id: ${ALICE}\n`);

  // Sanity: Alice content seeded.
  const aliceForum = await prisma.post.findMany({ where: { authorId: ALICE, isDeleted: false } });
  const aliceComments = await prisma.comment.findMany({ where: { authorId: ALICE, isDeleted: false } });
  if (aliceForum.length === 0 || aliceComments.length === 0) {
    console.error("Run scripts/seed-alice-content.ts first.");
    process.exit(1);
  }

  // Clean any prior state from earlier runs.
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: hostId, blockedId: ALICE }, { blockerId: ALICE, blockedId: hostId }] } });
  await prisma.notification.deleteMany({ where: { userId: hostId, actorId: ALICE } });
  await prisma.post.deleteMany({ where: { authorId: ALICE, content: { startsWith: "BLOCK-CHK-" } } });
  await prisma.comment.deleteMany({ where: { authorId: ALICE, content: { startsWith: "BLOCK-CHK-" } } });

  // Make a host post that Alice will react to.
  let hostPost = await prisma.post.findFirst({ where: { authorId: hostId } });
  if (!hostPost) {
    hostPost = await prisma.post.create({ data: { authorId: hostId, postType: "image-text", content: "host post", sourceLanguage: "en", images: [] } });
  }

  // Seed: identified post + identified comment + ANON post + ANON comment by Alice.
  const identPost = await prisma.post.create({ data: { authorId: ALICE, postType: "image-text", sourceLanguage: "en", content: "BLOCK-CHK-IDENT-POST", images: [], isAnonymous: false } });
  const anonPost = await prisma.post.create({ data: { authorId: ALICE, postType: "image-text", sourceLanguage: "en", content: "BLOCK-CHK-ANON-POST", images: [], isAnonymous: true, anonymousName: "G", anonymousAvatar: "x" } });
  const identComment = await prisma.comment.create({ data: { postId: hostPost.id, authorId: ALICE, sourceLanguage: "en", content: "BLOCK-CHK-IDENT-COMMENT", isAnonymous: false } });
  const anonComment = await prisma.comment.create({ data: { postId: hostPost.id, authorId: ALICE, sourceLanguage: "en", content: "BLOCK-CHK-ANON-COMMENT", isAnonymous: true, anonymousName: "G" } });

  // Notifications from Alice → host (like / comment / mention / follow).
  await prisma.notification.createMany({
    data: [
      { userId: hostId, type: "like", actorId: ALICE, postId: hostPost.id },
      { userId: hostId, type: "comment", actorId: ALICE, postId: hostPost.id, commentId: identComment.id },
      { userId: hostId, type: "mention", actorId: ALICE, postId: hostPost.id },
      { userId: hostId, type: "follow", actorId: ALICE },
    ],
  });

  // Bob (third party, unblocked) reposts Alice's identified post — to test
  // repost-embed stripping. Reuse hostId as Bob for simplicity.
  const repost = await prisma.post.create({
    data: {
      authorId: hostId,
      postType: "image-text",
      sourceLanguage: "en",
      content: "BLOCK-CHK-REPOST-WRAPPER",
      images: [],
      isAnonymous: false,
      isRepost: true,
      originalPostId: identPost.id,
    },
  });

  // ---- BEFORE BLOCK ----------------------------------------------------
  console.log("[before-block]");
  let blockedIds = await getBlockedUserIds(hostId);
  check("getBlockedUserIds empty before block", blockedIds.length === 0);

  // ---- BLOCK -----------------------------------------------------------
  console.log("\n[block: host → Alice]");
  await prisma.block.create({ data: { blockerId: hostId, blockedId: ALICE } });
  blockedIds = await getBlockedUserIds(hostId);
  check("getBlockedUserIds returns Alice after block", blockedIds.length === 1 && blockedIds[0] === ALICE);

  // ---- VISIBILITY: forum feed (Tier B + anon policy) ------------------
  console.log("\n[forum feed visibility]");
  const feedPosts = await prisma.post.findMany({
    where: { isDeleted: false, NOT: { authorId: { in: blockedIds }, isAnonymous: false } },
    select: { id: true },
  });
  check("identified post from blocked author hidden", !feedPosts.some((p) => p.id === identPost.id));
  check("ANONYMOUS post from blocked author still visible (anon policy)", feedPosts.some((p) => p.id === anonPost.id));
  check("repost wrapper still visible (Bob is not blocked)", feedPosts.some((p) => p.id === repost.id));

  // ---- VISIBILITY: post comments --------------------------------------
  console.log("\n[post comments visibility]");
  const commentRows = await prisma.comment.findMany({
    where: { postId: hostPost.id, isDeleted: false, NOT: { authorId: { in: blockedIds }, isAnonymous: false } },
    select: { id: true },
  });
  check("identified comment from blocked author hidden", !commentRows.some((c) => c.id === identComment.id));
  check("ANONYMOUS comment from blocked author still visible (anon policy)", commentRows.some((c) => c.id === anonComment.id));

  // ---- VISIBILITY: function-card lists --------------------------------
  console.log("\n[function-card list visibility]");
  const partner = await prisma.partnerPost.findMany({ where: { authorId: { notIn: blockedIds } }, select: { authorId: true } });
  check("partner list excludes Alice", !partner.some((p) => p.authorId === ALICE));
  const errand = await prisma.errand.findMany({ where: { authorId: { notIn: blockedIds } }, select: { authorId: true } });
  check("errand list excludes Alice", !errand.some((e) => e.authorId === ALICE));
  const secondhand = await prisma.secondhandItem.findMany({ where: { authorId: { notIn: blockedIds } }, select: { authorId: true } });
  check("secondhand list excludes Alice", !secondhand.some((s) => s.authorId === ALICE));

  // ---- VISIBILITY: notifications --------------------------------------
  console.log("\n[notifications visibility]");
  const likes = await prisma.notification.findMany({ where: { userId: hostId, type: "like", actorId: { notIn: blockedIds } } });
  check("likes notifications hide Alice", !likes.some((n) => n.actorId === ALICE));
  const cmts = await prisma.notification.findMany({ where: { userId: hostId, type: { in: ["comment", "mention"] }, actorId: { notIn: blockedIds } } });
  check("comments/mentions notifications hide Alice", !cmts.some((n) => n.actorId === ALICE));
  const follows = await prisma.notification.findMany({ where: { userId: hostId, type: "follow", actorId: { notIn: blockedIds } } });
  check("follow notifications hide Alice", !follows.some((n) => n.actorId === ALICE));
  const unreadLikes = await prisma.notification.count({ where: { userId: hostId, type: "like", isRead: false, actorId: { notIn: blockedIds } } });
  const unreadFollow = await prisma.notification.count({ where: { userId: hostId, type: "follow", isRead: false, actorId: { notIn: blockedIds } } });
  const unreadCmts = await prisma.notification.count({ where: { userId: hostId, type: { in: ["comment", "mention"] }, isRead: false, actorId: { notIn: blockedIds } } });
  check("unread-count likes filters Alice", unreadLikes === 0);
  check("unread-count follow filters Alice", unreadFollow === 0);
  check("unread-count comments filters Alice", unreadCmts === 0);

  // ---- VISIBILITY: contact list (getConversations) --------------------
  console.log("\n[contact list visibility]");
  // Replay getConversations filter: blockedPartnerIds NOT IN.
  const conversationRows = await prisma.directConversation.findMany({
    where: { ownerId: hostId, deletedAt: null, ...(blockedIds.length > 0 ? { partnerId: { notIn: blockedIds } } : {}) },
    select: { partnerId: true },
  });
  check("conversation list excludes Alice", !conversationRows.some((c) => c.partnerId === ALICE));

  // ---- VISIBILITY: repost embed strip ---------------------------------
  console.log("\n[repost embed visibility]");
  // Replay forum/posts/route.ts repost-embed strip
  const repostFetched = await prisma.post.findUnique({
    where: { id: repost.id },
    select: { originalPost: { select: { authorId: true, isAnonymous: true } } },
  });
  const orig = repostFetched?.originalPost ?? null;
  const quotedAuthorBlocked = orig !== null && !orig.isAnonymous && blockedIds.includes(orig.authorId);
  check("repost embed of identified blocked author is stripped (quotedPost would be null)", quotedAuthorBlocked === true);

  // ---- INTERACTION: follow gate ---------------------------------------
  console.log("\n[follow gate]");
  // Simulate the follow-route gate: build the blocked set + check.
  const aliceBlocked = new Set(await getBlockedUserIds(ALICE));
  check("follow Alice → host: 403 BLOCKED (host is in Alice's blocked-set when host blocked her)", aliceBlocked.has(hostId));

  // ---- INTERACTION: DM forward gate -----------------------------------
  console.log("\n[DM forward gate]");
  // First create a partner post by Alice so we have a forwardable card.
  const partnerByAlice = await prisma.partnerPost.findFirst({ where: { authorId: ALICE }, select: { id: true } });
  if (partnerByAlice) {
    const cardAuthor = await getFunctionRefAuthorId({ type: "partner", id: partnerByAlice.id, title: "x" });
    check("getFunctionRefAuthorId resolves card author to Alice", cardAuthor === ALICE);
    // Replay the DM POST gate: check Block on either side.
    const cardBlock = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: hostId, blockedId: ALICE },
          { blockerId: ALICE, blockedId: hostId },
        ],
      },
    });
    check("forwarding Alice's card to host: gate fires (Block row exists)", cardBlock !== null);
  }

  // ---- BIDIRECTIONAL: flip ---------------------------------------------
  console.log("\n[bidirectional flip: Alice → host]");
  await prisma.block.deleteMany({ where: { blockerId: hostId, blockedId: ALICE } });
  await prisma.block.create({ data: { blockerId: ALICE, blockedId: hostId } });
  blockedIds = await getBlockedUserIds(hostId);
  check("symmetric: getBlockedUserIds(host) still includes Alice", blockedIds.includes(ALICE));

  const feedAfterFlip = await prisma.post.findMany({
    where: { isDeleted: false, NOT: { authorId: { in: blockedIds }, isAnonymous: false } },
    select: { id: true },
  });
  check("symmetric: identified Alice post still hidden", !feedAfterFlip.some((p) => p.id === identPost.id));
  check("symmetric: anon Alice post still visible", feedAfterFlip.some((p) => p.id === anonPost.id));

  // ---- UNBLOCK: visibility restored -----------------------------------
  console.log("\n[unblock]");
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: hostId, blockedId: ALICE }, { blockerId: ALICE, blockedId: hostId }] } });
  blockedIds = await getBlockedUserIds(hostId);
  check("getBlockedUserIds empty after unblock", blockedIds.length === 0);
  const feedAfterUnblock = await prisma.post.findMany({
    where: { isDeleted: false, NOT: blockedIds.length > 0 ? { authorId: { in: blockedIds }, isAnonymous: false } : { authorId: "__never__" } },
    select: { id: true },
  });
  check("identified post visible again after unblock", feedAfterUnblock.some((p) => p.id === identPost.id));

  // ---- CLEANUP --------------------------------------------------------
  console.log("\n[cleanup]");
  await prisma.notification.deleteMany({ where: { userId: hostId, actorId: ALICE } });
  await prisma.post.deleteMany({ where: { id: { in: [identPost.id, anonPost.id, repost.id] } } });
  await prisma.comment.deleteMany({ where: { id: { in: [identComment.id, anonComment.id] } } });
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: hostId, blockedId: ALICE }, { blockerId: ALICE, blockedId: hostId }] } });

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
