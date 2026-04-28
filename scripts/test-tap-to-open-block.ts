/**
 * Runtime check: tap-to-open behaviour on shared posts when the author is
 * blocked.
 *
 * Scenario:
 *   1. Bob (any third party) DM-shares Alice's forum post to Charlie.
 *   2. Charlie has Alice in their block-set (either direction).
 *   3. Charlie taps the card preview in chat → mobile navigates to
 *      PostDetail → mobile fetches GET /api/forum/posts/{postId}.
 *   4. Server's block gate must reject the fetch with 403 BLOCKED for
 *      identified posts. For anonymous posts the gate is intentionally
 *      bypassed (anon policy preserves authorship privacy).
 *
 * This script replays the gate logic from
 * app/api/forum/posts/[id]/route.ts:236-254 against the real local DB.
 *
 * Usage: npx tsx scripts/test-tap-to-open-block.ts
 */
import { PrismaClient } from "@prisma/client";

const ALICE_ID = "3dffbbf9-4967-4c7e-9874-67d08ba8e88d";
const HOST_USERNAME = "block_test_host_tmp";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

/**
 * Replays the same logic as app/api/forum/posts/[id]/route.ts:236-254 to
 * decide whether tap-to-open returns 403. Returns one of:
 *   - "OK"          → gate passes; the route would serialize and return
 *                     the post (subject to other checks like deletion).
 *   - "BLOCKED_403" → gate returns 403 because identified post + Block row.
 */
async function replayTapToOpenGate(viewerId: string, postId: string): Promise<string> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, isAnonymous: true, isDeleted: true },
  });
  if (!post || post.isDeleted) return "NOT_FOUND_404";

  // The gate bypasses block enforcement for anonymous posts.
  if (post.isAnonymous) return "OK";

  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: post.authorId },
        { blockerId: post.authorId, blockedId: viewerId },
      ],
    },
  });
  return blocked ? "BLOCKED_403" : "OK";
}

async function main() {
  console.log("=== Tap-to-open block gate runtime check ===\n");

  // Resolve / create the test host (Charlie).
  let host = await prisma.user.findUnique({ where: { userName: HOST_USERNAME }, select: { id: true } });
  if (!host) {
    host = await prisma.user.create({
      data: { userName: HOST_USERNAME, nickname: "BlockTestHost", avatar: "", gender: "other", isActive: true, isBanned: false, role: "USER" },
      select: { id: true },
    });
  }
  console.log(`Charlie (host) id: ${host.id}`);
  console.log(`Alice id: ${ALICE_ID}\n`);

  // Clean prior state and seed two posts authored by Alice — one identified
  // and one anonymous — so we can verify both branches of the gate.
  await prisma.block.deleteMany({
    where: { OR: [{ blockerId: host.id, blockedId: ALICE_ID }, { blockerId: ALICE_ID, blockedId: host.id }] },
  });
  await prisma.post.deleteMany({
    where: { authorId: ALICE_ID, content: { startsWith: "TAP-OPEN-CHK-" } },
  });
  const identifiedPost = await prisma.post.create({
    data: {
      authorId: ALICE_ID,
      postType: "image-text",
      sourceLanguage: "en",
      content: "TAP-OPEN-CHK-IDENTIFIED: Alice's identified post",
      images: [],
      isAnonymous: false,
    },
  });
  const anonPost = await prisma.post.create({
    data: {
      authorId: ALICE_ID,
      postType: "image-text",
      sourceLanguage: "en",
      content: "TAP-OPEN-CHK-ANON: Alice's anonymous post",
      images: [],
      isAnonymous: true,
      anonymousName: "AnonGuest",
      anonymousAvatar: "anon-1",
    },
  });

  // ---- BEFORE BLOCK ----------------------------------------------------
  console.log("[before block]");
  check(
    "tap-to-open identified post → OK (no block yet)",
    (await replayTapToOpenGate(host.id, identifiedPost.id)) === "OK"
  );
  check(
    "tap-to-open anon post → OK",
    (await replayTapToOpenGate(host.id, anonPost.id)) === "OK"
  );

  // ---- BLOCK: host → Alice --------------------------------------------
  console.log("\n[block: host → Alice]");
  await prisma.block.create({ data: { blockerId: host.id, blockedId: ALICE_ID } });
  const identGate = await replayTapToOpenGate(host.id, identifiedPost.id);
  const anonGate = await replayTapToOpenGate(host.id, anonPost.id);
  check(
    "tap-to-open IDENTIFIED post returns 403 BLOCKED",
    identGate === "BLOCKED_403",
    `gate verdict: ${identGate}`
  );
  check(
    "tap-to-open ANONYMOUS post still returns OK (anon policy)",
    anonGate === "OK",
    `gate verdict: ${anonGate}`
  );

  // ---- FLIP: Alice blocks host (symmetric check) -----------------------
  console.log("\n[symmetric: Alice → host]");
  await prisma.block.deleteMany({ where: { blockerId: host.id, blockedId: ALICE_ID } });
  await prisma.block.create({ data: { blockerId: ALICE_ID, blockedId: host.id } });
  check(
    "tap-to-open IDENTIFIED post still 403 (block is symmetric)",
    (await replayTapToOpenGate(host.id, identifiedPost.id)) === "BLOCKED_403"
  );
  check(
    "tap-to-open ANONYMOUS post still OK (anon policy is symmetric too)",
    (await replayTapToOpenGate(host.id, anonPost.id)) === "OK"
  );

  // ---- DM PAYLOAD shape sanity (the share format the mobile sends) -----
  // The mobile encodes a forwarded card as MESSAGE_CARD_PREFIX = "[BUHUB_CARD]"
  // with payload { type: 'post', postId, title, posterName }.
  // The recipient taps it → opens PostDetail → fetches GET /api/forum/posts/{postId}.
  // That GET is exactly what replayTapToOpenGate models above. So the
  // tap-to-open block check holds regardless of which prefix the DM used:
  // the 403 happens at the post-detail fetch, not at message render.
  console.log("\n[DM payload routing]");
  const dmPayload = JSON.stringify({
    type: "post",
    postId: identifiedPost.id,
    title: "TAP-OPEN-CHK-IDENTIFIED",
    posterName: "Alice",
  });
  const cardEnvelope = `[BUHUB_CARD]${dmPayload}`;
  const decoded = JSON.parse(cardEnvelope.slice("[BUHUB_CARD]".length));
  check(
    "DM card payload encodes a forum-post with postId",
    decoded.type === "post" && decoded.postId === identifiedPost.id
  );
  const routedGate = await replayTapToOpenGate(host.id, decoded.postId);
  check(
    "tapping the chat card → routes to GET /api/forum/posts/{postId} → 403 BLOCKED",
    routedGate === "BLOCKED_403",
    `routed gate verdict: ${routedGate}`
  );

  // ---- CLEANUP --------------------------------------------------------
  console.log("\n[cleanup]");
  await prisma.block.deleteMany({
    where: { OR: [{ blockerId: host.id, blockedId: ALICE_ID }, { blockerId: ALICE_ID, blockedId: host.id }] },
  });
  await prisma.post.deleteMany({ where: { id: { in: [identifiedPost.id, anonPost.id] } } });

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
