/**
 * Runtime integration test for Tier-B block enforcement.
 *
 * Verifies, against the real local DB, that when a host blocks Alice:
 *   - Forum post comments under any post hide Alice's comments.
 *   - Partner / Errand / Secondhand list endpoints hide Alice's items.
 *   - Notifications (likes, comments, followers) hide Alice's actions.
 *   - The block is symmetric: Alice blocking host has the same effect.
 *
 * Does NOT require the dev server: each test replays the same Prisma query
 * shape the corresponding route handler uses, with the new
 * getBlockedUserIds(viewerId) filter applied. This isolates the data-layer
 * correctness of Tier-B without spinning up Next.js or minting JWTs.
 *
 * Usage:
 *   1. Make sure Alice (3dffbbf9-…-67d08ba8e88d) and her seeded content
 *      exist (run scripts/seed-alice-content.ts first if not).
 *   2. npx tsx scripts/test-tier-b-block.ts
 *
 * Exit code 0 = all assertions passed; 1 = any failure.
 */
import { PrismaClient } from "@prisma/client";
import { getBlockedUserIds } from "@/src/lib/blocks";

const ALICE_ID = "3dffbbf9-4967-4c7e-9874-67d08ba8e88d";
const HOST_USERNAME = "block_test_host_tmp";
const HOST_NICKNAME = "BlockTestHost";

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function ensureHost(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { userName: HOST_USERNAME },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.user.create({
    data: {
      userName: HOST_USERNAME,
      nickname: HOST_NICKNAME,
      avatar: "",
      gender: "other",
      isActive: true,
      isBanned: false,
      role: "USER",
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  console.log("=== Tier-B block enforcement runtime test ===\n");
  const hostId = await ensureHost();
  console.log(`Host user id: ${hostId}`);
  console.log(`Alice user id: ${ALICE_ID}\n`);

  const aliceForumPosts = await prisma.post.findMany({
    where: { authorId: ALICE_ID, isDeleted: false },
    select: { id: true },
  });
  if (aliceForumPosts.length === 0) {
    console.error("Alice has no forum posts. Run scripts/seed-alice-content.ts first.");
    process.exit(1);
  }
  const aliceComments = await prisma.comment.findMany({
    where: { authorId: ALICE_ID, isDeleted: false },
    select: { id: true, postId: true },
  });
  if (aliceComments.length === 0) {
    console.error("Alice has no comments. Run scripts/seed-alice-content.ts first.");
    process.exit(1);
  }
  const targetPostId = aliceComments[0].postId;
  const dummyPost = aliceForumPosts[0].id;

  await prisma.notification.deleteMany({
    where: { userId: hostId, actorId: ALICE_ID },
  });
  await prisma.notification.createMany({
    data: [
      { userId: hostId, type: "like", actorId: ALICE_ID, postId: dummyPost },
      { userId: hostId, type: "comment", actorId: ALICE_ID, postId: dummyPost, commentId: aliceComments[0].id },
      { userId: hostId, type: "mention", actorId: ALICE_ID, postId: dummyPost },
      { userId: hostId, type: "follow", actorId: ALICE_ID },
    ],
  });

  console.log("[before-block] host has NOT blocked Alice yet.");
  await prisma.block.deleteMany({
    where: { OR: [{ blockerId: hostId, blockedId: ALICE_ID }, { blockerId: ALICE_ID, blockedId: hostId }] },
  });

  let blockedIds = await getBlockedUserIds(hostId);
  check("getBlockedUserIds returns empty before block", blockedIds.length === 0, `got [${blockedIds.join(",")}]`);

  const beforeComments = await prisma.comment.findMany({
    where: {
      postId: targetPostId,
      isDeleted: false,
      ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
    },
    select: { authorId: true },
  });
  check("post comments include Alice's comment before block",
    beforeComments.some((c) => c.authorId === ALICE_ID));

  const beforePartner = await prisma.partnerPost.findMany({
    where: { ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}) },
    select: { authorId: true },
  });
  check("partner list includes Alice's post before block",
    beforePartner.some((p) => p.authorId === ALICE_ID));

  const beforeErrand = await prisma.errand.findMany({
    where: { ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}) },
    select: { authorId: true },
  });
  check("errand list includes Alice's post before block",
    beforeErrand.some((e) => e.authorId === ALICE_ID));

  const beforeSecondhand = await prisma.secondhandItem.findMany({
    where: { ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}) },
    select: { authorId: true },
  });
  check("secondhand list includes Alice's item before block",
    beforeSecondhand.some((s) => s.authorId === ALICE_ID));

  const beforeNotifLikes = await prisma.notification.findMany({
    where: {
      userId: hostId,
      type: "like",
      ...(blockedIds.length > 0 ? { actorId: { notIn: blockedIds } } : {}),
    },
  });
  check("likes notifications include Alice before block",
    beforeNotifLikes.some((n) => n.actorId === ALICE_ID));

  const beforeNotifComments = await prisma.notification.findMany({
    where: {
      userId: hostId,
      type: { in: ["comment", "mention"] },
      ...(blockedIds.length > 0 ? { actorId: { notIn: blockedIds } } : {}),
    },
  });
  check("comments/mentions notifications include Alice before block",
    beforeNotifComments.some((n) => n.actorId === ALICE_ID));

  const beforeNotifFollow = await prisma.notification.findMany({
    where: {
      userId: hostId,
      type: "follow",
      ...(blockedIds.length > 0 ? { actorId: { notIn: blockedIds } } : {}),
    },
  });
  check("follow notifications include Alice before block",
    beforeNotifFollow.some((n) => n.actorId === ALICE_ID));

  console.log("\n[block] host blocks Alice.");
  await prisma.block.create({
    data: { blockerId: hostId, blockedId: ALICE_ID },
  });

  console.log("\n[after-block] host should no longer see Alice's content.");
  blockedIds = await getBlockedUserIds(hostId);
  check("getBlockedUserIds returns Alice after block",
    blockedIds.length === 1 && blockedIds[0] === ALICE_ID,
    `got [${blockedIds.join(",")}]`);

  const afterComments = await prisma.comment.findMany({
    where: { postId: targetPostId, isDeleted: false, authorId: { notIn: blockedIds } },
    select: { authorId: true },
  });
  check("post comments hide Alice's comment after block",
    !afterComments.some((c) => c.authorId === ALICE_ID));

  const afterPartner = await prisma.partnerPost.findMany({
    where: { authorId: { notIn: blockedIds } },
    select: { authorId: true },
  });
  check("partner list hides Alice's posts after block",
    !afterPartner.some((p) => p.authorId === ALICE_ID));

  const afterErrand = await prisma.errand.findMany({
    where: { authorId: { notIn: blockedIds } },
    select: { authorId: true },
  });
  check("errand list hides Alice's posts after block",
    !afterErrand.some((e) => e.authorId === ALICE_ID));

  const afterSecondhand = await prisma.secondhandItem.findMany({
    where: { authorId: { notIn: blockedIds } },
    select: { authorId: true },
  });
  check("secondhand list hides Alice's items after block",
    !afterSecondhand.some((s) => s.authorId === ALICE_ID));

  const afterNotifLikes = await prisma.notification.findMany({
    where: { userId: hostId, type: "like", actorId: { notIn: blockedIds } },
  });
  check("likes notifications hide Alice after block",
    !afterNotifLikes.some((n) => n.actorId === ALICE_ID));

  const afterNotifComments = await prisma.notification.findMany({
    where: { userId: hostId, type: { in: ["comment", "mention"] }, actorId: { notIn: blockedIds } },
  });
  check("comments/mentions notifications hide Alice after block",
    !afterNotifComments.some((n) => n.actorId === ALICE_ID));

  const afterNotifFollow = await prisma.notification.findMany({
    where: { userId: hostId, type: "follow", actorId: { notIn: blockedIds } },
  });
  check("follow notifications hide Alice after block",
    !afterNotifFollow.some((n) => n.actorId === ALICE_ID));

  console.log("\n[bidirectional] flip — remove host→Alice, add Alice→host.");
  await prisma.block.deleteMany({
    where: { blockerId: hostId, blockedId: ALICE_ID },
  });
  await prisma.block.create({
    data: { blockerId: ALICE_ID, blockedId: hostId },
  });
  blockedIds = await getBlockedUserIds(hostId);
  check("getBlockedUserIds is symmetric (Alice still hidden when she blocks host)",
    blockedIds.length === 1 && blockedIds[0] === ALICE_ID,
    `got [${blockedIds.join(",")}]`);

  console.log("\n[cleanup] removing Block rows + test notifications.");
  await prisma.block.deleteMany({
    where: { OR: [{ blockerId: hostId, blockedId: ALICE_ID }, { blockerId: ALICE_ID, blockedId: hostId }] },
  });
  await prisma.notification.deleteMany({
    where: { userId: hostId, actorId: ALICE_ID },
  });

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
