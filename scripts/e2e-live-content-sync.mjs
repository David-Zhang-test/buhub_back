#!/usr/bin/env node
// End-to-end live-content-sync test driver.
//
// Drives a scripted sequence of API actions as Bob and Dave (with Alice
// remaining the operator on a phone) to validate that posts, likes, and
// comments propagate to all 5 viewing surfaces:
//   1. Forum page (Discover feed)
//   2. Forum detail page (PostDetail)
//   3. Me screen (own posts / comments / likes / bookmarks)
//   4. Search page
//   5. Following list (forum tab)
//
// Each step prints (a) the action it just took, (b) what Alice should observe
// on her phone within the polling window, and (c) the latest DB state for that
// surface. The operator runs this script and watches their phone in parallel.
//
// Prereqs: dev server on port 3000, all three users have password "Password123"
// and verified @life.hkbu.edu.hk emails.

import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = "Password123";

const ALICE = { email: "23245322@life.hkbu.edu.hk", label: "Alice (operator)" };
const BOB = { email: "bob@life.hkbu.edu.hk", label: "Bob" };
const DAVE = { email: "23200001@life.hkbu.edu.hk", label: "Dave" };

const tokens = new Map();
const userIds = new Map();

const log = {
  step: (n, title) => console.log(`\n[${n}] ${title}`),
  info: (msg) => console.log(`     ${msg}`),
  watch: (msg) => console.log(`  👀 ${msg}`),
  wait: (s) => console.log(`  ⏳ waiting ${s}s for polling window...`),
  done: () => console.log(`  ✅ done`),
  fail: (msg) => console.log(`  ❌ ${msg}`),
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/auth/ping`).catch(() => null);
      if (r) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("dev server never became reachable on " + BASE);
}

async function loginAll() {
  for (const u of [ALICE, BOB, DAVE]) {
    const r = await call("POST", "/api/auth/login", {
      body: { email: u.email, password: PASSWORD },
    });
    const tok = r?.data?.token || r?.token;
    const uid = r?.data?.user?.id || r?.user?.id;
    if (!tok || !uid) throw new Error(`login failed for ${u.email}: ${JSON.stringify(r)}`);
    tokens.set(u.email, tok);
    userIds.set(u.email, uid);
    log.info(`logged in ${u.label}: ${uid}`);
  }
}

async function ensureFollow(followerEmail, targetUserName) {
  const profile = await call("GET", `/api/user/${targetUserName}`, {
    token: tokens.get(followerEmail),
  });
  const isFollowing = profile?.data?.isFollowedByMe ?? profile?.isFollowedByMe;
  if (!isFollowing) {
    const r = await call("POST", `/api/user/${targetUserName}/follow`, {
      token: tokens.get(followerEmail),
    });
    log.info(`${followerEmail} → toggled follow on ${targetUserName} → followed=${r?.data?.followed}`);
  } else {
    log.info(`${followerEmail} already follows ${targetUserName}`);
  }
}

async function unfollow(followerEmail, targetUserName) {
  // POST endpoint is a toggle. Verify current state and toggle if currently following.
  const profile = await call("GET", `/api/user/${targetUserName}`, {
    token: tokens.get(followerEmail),
  });
  const isFollowing = profile?.data?.isFollowedByMe ?? profile?.isFollowedByMe;
  if (isFollowing) {
    const r = await call("POST", `/api/user/${targetUserName}/follow`, {
      token: tokens.get(followerEmail),
    });
    log.info(`${followerEmail} → toggled unfollow on ${targetUserName} → followed=${r?.data?.followed}`);
  } else {
    log.info(`${followerEmail} was not following ${targetUserName}`);
  }
}

async function createPost(actorEmail, content) {
  const r = await call("POST", "/api/forum/posts", {
    token: tokens.get(actorEmail),
    body: { postType: "text", content, isAnonymous: false },
  });
  return r?.data?.id || r?.id;
}

async function likePost(actorEmail, postId) {
  return call("POST", `/api/forum/posts/${postId}/like`, {
    token: tokens.get(actorEmail),
  });
}

async function commentOnPost(actorEmail, postId, content, parentId) {
  return call("POST", `/api/forum/posts/${postId}/comments`, {
    token: tokens.get(actorEmail),
    body: { postId, content, ...(parentId ? { parentId } : {}) },
  });
}

async function likeComment(actorEmail, commentId) {
  return call("POST", `/api/comments/${commentId}/like`, {
    token: tokens.get(actorEmail),
  });
}

async function search(actorEmail, query) {
  return call("GET", `/api/forum/search?q=${encodeURIComponent(query)}`, {
    token: tokens.get(actorEmail),
  });
}

async function getPost(actorEmail, postId) {
  return call("GET", `/api/forum/posts/${postId}`, { token: tokens.get(actorEmail) });
}

async function getMyContent(actorEmail) {
  return call("GET", "/api/user/profile/content", { token: tokens.get(actorEmail) });
}

async function getFollowingFeed(actorEmail) {
  return call("GET", "/api/feed/following?page=1&limit=20", {
    token: tokens.get(actorEmail),
  });
}

async function main() {
  console.log("──────────────────────────────────────────────────────────");
  console.log("  E2E LIVE-CONTENT-SYNC TEST (Alice = operator on phone)   ");
  console.log("──────────────────────────────────────────────────────────");

  log.step("PRE", "Waiting for dev server on " + BASE);
  await waitForServer();
  log.done();

  log.step("PRE", "Logging in Alice / Bob / Dave");
  await loginAll();
  log.done();

  log.step("PRE", "Ensuring Alice follows Bob (so Bob's posts appear in her Following feed)");
  await ensureFollow(ALICE.email, "bob_bu");
  log.done();

  // ────────── SURFACE 1: FORUM (Discover) ──────────
  log.step(1, "Bob creates a post — should appear on Alice's Discover feed");
  const livetestTag = `livetest${Date.now()}`;
  const post1 = await createPost(BOB.email, `Hi this is Bob — live sync probe ${livetestTag}. Anyone working on PHIL2030 essay this week?`);
  log.info(`postId = ${post1}`);
  log.watch(`Alice: open Forum tab → Discover. Within 15s, Bob's new post should appear at top.`);
  log.wait(20);
  await sleep(20_000);
  log.done();

  // ────────── SURFACE 5: FOLLOWING ──────────
  log.step(2, "Verify Bob's new post is also in Alice's Following feed (since Alice follows Bob)");
  const following = await getFollowingFeed(ALICE.email);
  const inFollowing = (following?.data?.posts ?? following?.posts ?? []).some((p) => p.id === post1);
  if (inFollowing) {
    log.info(`server confirms post is in Following feed`);
  } else {
    log.fail(`server says post NOT in Following feed — likely cached, will appear on next 15s tick`);
  }
  log.watch(`Alice: switch to Following tab. Bob's post must be there within 15s.`);
  log.wait(15);
  await sleep(15_000);
  log.done();

  // ────────── SURFACE 2: POST DETAIL (2s polling) ──────────
  log.step(3, "Dave likes Bob's post — Alice should see counter 0→1 if she's on PostDetail");
  await likePost(DAVE.email, post1);
  const postState1 = await getPost(ALICE.email, post1);
  log.info(`server likeCount = ${postState1?.data?.likes ?? postState1?.likes}`);
  log.watch(`Alice: open Bob's post detail. Like counter should reach 1 within 2s.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(4, "Dave comments on Bob's post (top-level)");
  const c1 = await commentOnPost(DAVE.email, post1, "Im taking PHIL2030 too — happy to study together");
  const c1Id = c1?.data?.id || c1?.id;
  log.info(`commentId = ${c1Id}`);
  log.watch(`Alice on PostDetail: comment list should show Dave's comment within 2s, counter 0→1.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(5, "Dave unlikes Bob's post (toggle off)");
  await likePost(DAVE.email, post1);
  const postState2 = await getPost(ALICE.email, post1);
  log.info(`server likeCount = ${postState2?.data?.likes ?? postState2?.likes} (toggled back)`);
  log.watch(`Alice on PostDetail: counter should drop 1→0 within 2s.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(6, "Bob replies to Dave's comment (nested reply)");
  const c2 = await commentOnPost(BOB.email, post1, "@Dave great — Saturday 3pm at Lib?", c1Id);
  const c2Id = c2?.data?.id || c2?.id;
  log.info(`replyId = ${c2Id}`);
  log.watch(`Alice on PostDetail: Bob's reply should appear nested under Dave's comment within 2s.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(7, "Dave likes Bob's reply (comment-level like)");
  await likeComment(DAVE.email, c2Id);
  log.watch(`Alice on PostDetail: heart icon on Bob's reply row goes 0→1 within 2s.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  // ────────── SURFACE 3: ME SCREEN (15s polling) ──────────
  log.step(8, "Alice creates her own post (so we can verify counter updates on Me screen)");
  const alicePostTag = `alicelivetest${Date.now()}`;
  const alicePostId = await createPost(ALICE.email, `Alice live-sync probe ${alicePostTag} — testing me screen counter`);
  log.info(`alicePostId = ${alicePostId}`);
  log.watch(`Alice: switch to Me tab → My posts. Alice's own post should be at top.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(9, "Bob likes Alice's post — counter on Alice's Me screen should bump");
  await likePost(BOB.email, alicePostId);
  log.watch(`Alice on Me → My posts: like count on her post 0→1 within 15s. (Also realtime: Alice gets notification:new event → ≤1s if WS connected)`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(10, "Dave comments on Alice's post — comment counter on Alice's Me screen should bump");
  await commentOnPost(DAVE.email, alicePostId, "Nice probe Alice — testing the live counter from Dave");
  log.watch(`Alice on Me → My posts: comment count on her post 0→1 within 15s.`);
  log.wait(5);
  await sleep(5_000);
  log.done();

  log.step(11, "Verify Alice's myContent reflects all 3 changes server-side");
  const mc = await getMyContent(ALICE.email);
  const aliceOwnPost = (mc?.data?.posts ?? mc?.posts ?? []).find((p) => p.postId === alicePostId);
  if (aliceOwnPost) {
    log.info(`server: Alice's post likes=${aliceOwnPost.likes} comments=${aliceOwnPost.comments}`);
  } else {
    log.fail(`could not locate Alice's post in myContent`);
  }
  log.done();

  // ────────── SURFACE 4: SEARCH ──────────
  log.step(12, `Search for the unique tag "${livetestTag}" — Bob's post should be found`);
  const r = await search(ALICE.email, livetestTag);
  const hits = Array.isArray(r?.data) ? r.data : (r?.data?.posts ?? r?.posts ?? []);
  log.info(`hits: ${hits.length} post(s)`);
  log.watch(`Alice: tap search icon, type "${livetestTag}". Bob's post should appear in results.`);
  log.done();

  log.step(13, "Search staleness: Dave likes Bob's post AGAIN (back to liked=true). Search has no auto-refetch — Alice must re-submit query to see the latest count.");
  await likePost(DAVE.email, post1);
  const r2 = await search(ALICE.email, livetestTag);
  const arr2 = Array.isArray(r2?.data) ? r2.data : (r2?.data?.posts ?? r2?.posts ?? []);
  const found = arr2.find((p) => p.id === post1);
  if (found) {
    log.info(`server search result: likes=${found.likes}, liked=${found.liked}`);
  }
  log.watch(`Alice: re-submit search → updated like count visible.`);
  log.done();

  // ────────── SURFACE 5: FOLLOWING (UNFOLLOW) ──────────
  log.step(14, "Alice unfollows Bob — Bob's posts must disappear from Alice's Following feed");
  await unfollow(ALICE.email, "bob_bu");
  const f2 = await getFollowingFeed(ALICE.email);
  const stillThere = (f2?.data?.posts ?? f2?.posts ?? []).some((p) => p.id === post1);
  if (stillThere) {
    log.fail(`Bob's post is still in Alice's Following feed after unfollow — bug`);
  } else {
    log.info(`server: Bob's post no longer in Following feed ✓`);
  }
  log.watch(`Alice on Forum → Following tab: Bob's post should disappear within 15s.`);
  log.wait(15);
  await sleep(15_000);
  log.done();

  log.step(15, "Re-follow Bob (cleanup)");
  await ensureFollow(ALICE.email, "bob_bu");
  log.done();

  // ────────── SUMMARY ──────────
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  ALL STEPS COMPLETE                                       ");
  console.log("──────────────────────────────────────────────────────────");
  console.log("Manual verification checklist (✓ what you saw, ✗ what didn't update in time):");
  console.log("  [ ] step 1  — Bob's new post appears on Discover");
  console.log("  [ ] step 2  — Bob's new post appears on Following tab");
  console.log("  [ ] step 3  — like counter 0→1 on PostDetail (≤2s)");
  console.log("  [ ] step 4  — Dave's comment appears in list (≤2s)");
  console.log("  [ ] step 5  — like counter 1→0 on toggle (≤2s)");
  console.log("  [ ] step 6  — Bob's reply appears nested under Dave's comment (≤2s)");
  console.log("  [ ] step 7  — heart on Bob's reply 0→1 (≤2s)");
  console.log("  [ ] step 8  — Alice's new post appears on Me → My posts");
  console.log("  [ ] step 9  — like counter 0→1 on Alice's post on Me screen (≤15s)");
  console.log("  [ ] step 10 — comment counter 0→1 on Alice's post on Me screen (≤15s)");
  console.log("  [ ] step 12 — search returns Bob's post when querying the unique tag");
  console.log("  [ ] step 14 — Bob's post disappears from Following after unfollow (≤15s)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ TEST DRIVER FAILED:", err.message);
    console.error(err);
    process.exit(1);
  });
