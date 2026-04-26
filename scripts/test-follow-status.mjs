#!/usr/bin/env node
// End-to-end follow-status test.
// Drives two seed users (alice, bob) through the full follow-state machine
// and asserts the API surfaces consistent flags across:
//   GET /api/user/[userName]              → isFollowedByMe / isFollowedByThem / isMutuallyFollowing
//   GET /api/user/profile/following       → isMutuallyFollowing per row
//   GET /api/user/profile/followers       → isMutuallyFollowing per row
//   GET /api/notifications/followers      → isMutuallyFollowing reflects current state
// Mutations:
//   POST /api/follow         body { userId }
//   DELETE /api/follow/[userId]

const API_URL = process.env.API_URL ?? "http://localhost:3000";

const ALICE = { email: "23245322@life.hkbu.edu.hk", password: "Password123" };
const BOB = { email: "bob@buhub.test", password: "Password123" };

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failed += 1;
  failures.push({ name, detail });
  console.log(`  ✗ ${name}`);
  if (detail) console.log(`      ${detail}`);
}
function assert(name, cond, detail) {
  if (cond) ok(name); else fail(name, detail);
}

async function call(method, path, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, json, text };
}

async function login(creds) {
  const r = await call("POST", "/api/auth/login", { body: creds });
  if (r.status !== 200 || !r.json?.token) {
    throw new Error(`login failed for ${creds.email}: ${r.status} ${r.text}`);
  }
  return { token: r.json.token, user: r.json.user };
}

async function getProfile(token, userName) {
  const r = await call("GET", `/api/user/${encodeURIComponent(userName)}`, { token });
  if (r.status !== 200) throw new Error(`profile ${userName}: ${r.status} ${r.text}`);
  return r.json.data;
}

async function getFollowingList(token) {
  const r = await call("GET", `/api/user/profile/following`, { token });
  if (r.status !== 200) throw new Error(`following list: ${r.status}`);
  return r.json.data;
}

async function getFollowersList(token) {
  const r = await call("GET", `/api/user/profile/followers`, { token });
  if (r.status !== 200) throw new Error(`followers list: ${r.status}`);
  return r.json.data;
}

async function getFollowerNotifications(token) {
  const r = await call("GET", `/api/notifications/followers`, { token });
  if (r.status !== 200) throw new Error(`follower notifications: ${r.status}`);
  return r.json.data;
}

async function follow(token, targetUserId) {
  const r = await call("POST", `/api/follow`, { token, body: { userId: targetUserId } });
  if (r.status !== 200) throw new Error(`follow: ${r.status} ${r.text}`);
  return r.json;
}

async function unfollow(token, targetUserId) {
  const r = await call("DELETE", `/api/follow/${targetUserId}`, { token });
  if (r.status !== 200) throw new Error(`unfollow: ${r.status} ${r.text}`);
  return r.json;
}

async function ensureUnfollowed(token, targetUserId) {
  // Idempotent: DELETE is a no-op when no follow row exists.
  await call("DELETE", `/api/follow/${targetUserId}`, { token });
}

function assertProfileFlags(label, profile, expected) {
  assert(`${label}: isFollowedByMe=${expected.isFollowedByMe}`,
    profile.isFollowedByMe === expected.isFollowedByMe,
    `got ${profile.isFollowedByMe}`);
  assert(`${label}: isFollowedByThem=${expected.isFollowedByThem}`,
    profile.isFollowedByThem === expected.isFollowedByThem,
    `got ${profile.isFollowedByThem}`);
  assert(`${label}: isMutuallyFollowing=${expected.isMutuallyFollowing}`,
    profile.isMutuallyFollowing === expected.isMutuallyFollowing,
    `got ${profile.isMutuallyFollowing}`);
}

function findRow(list, userName) {
  return list.find((row) => row.userName === userName);
}

async function run() {
  console.log(`Follow-status end-to-end test`);
  console.log(`  API: ${API_URL}`);
  console.log(`  Alice: ${ALICE.email}`);
  console.log(`  Bob:   ${BOB.email}\n`);

  console.log("Auth");
  const alice = await login(ALICE);
  const bob = await login(BOB);
  ok(`alice login (id=${alice.user.id.slice(0, 8)}…)`);
  ok(`bob login (id=${bob.user.id.slice(0, 8)}…)`);

  const aliceUserName = alice.user.userName;
  const bobUserName = bob.user.userName;
  if (!aliceUserName || !bobUserName) {
    throw new Error("seed users missing userName");
  }

  console.log("\nReset: ensure neither follows the other");
  await ensureUnfollowed(alice.token, bob.user.id);
  await ensureUnfollowed(bob.token, alice.user.id);
  ok("alice does not follow bob");
  ok("bob does not follow alice");

  // ─────────────────────────────────────────────────────────
  console.log("\nState 1 — neither follows the other");
  {
    const bobFromAlice = await getProfile(alice.token, bobUserName);
    assertProfileFlags("alice→bob profile", bobFromAlice, {
      isFollowedByMe: false, isFollowedByThem: false, isMutuallyFollowing: false,
    });

    const aliceFromBob = await getProfile(bob.token, aliceUserName);
    assertProfileFlags("bob→alice profile", aliceFromBob, {
      isFollowedByMe: false, isFollowedByThem: false, isMutuallyFollowing: false,
    });

    const aliceFollowing = await getFollowingList(alice.token);
    assert("alice's following list does not contain bob",
      !findRow(aliceFollowing, bobUserName));

    const aliceFollowers = await getFollowersList(alice.token);
    assert("alice's followers list does not contain bob",
      !findRow(aliceFollowers, bobUserName));
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nState 2 — alice follows bob (one-way)");
  await follow(alice.token, bob.user.id);
  ok("alice → POST /api/follow {bob}");

  {
    const bobFromAlice = await getProfile(alice.token, bobUserName);
    assertProfileFlags("alice→bob profile", bobFromAlice, {
      isFollowedByMe: true, isFollowedByThem: false, isMutuallyFollowing: false,
    });

    const aliceFromBob = await getProfile(bob.token, aliceUserName);
    assertProfileFlags("bob→alice profile", aliceFromBob, {
      isFollowedByMe: false, isFollowedByThem: true, isMutuallyFollowing: false,
    });

    const aliceFollowing = await getFollowingList(alice.token);
    const bobInAliceFollowing = findRow(aliceFollowing, bobUserName);
    assert("alice's following list contains bob", !!bobInAliceFollowing);
    assert("alice's following[bob].isFollowed === true", bobInAliceFollowing?.isFollowed === true);
    assert("alice's following[bob].isMutuallyFollowing === false",
      bobInAliceFollowing?.isMutuallyFollowing === false,
      `got ${bobInAliceFollowing?.isMutuallyFollowing}`);

    const bobFollowers = await getFollowersList(bob.token);
    const aliceInBobFollowers = findRow(bobFollowers, aliceUserName);
    assert("bob's followers list contains alice", !!aliceInBobFollowers);
    assert("bob's followers[alice].isFollowed === false (bob doesn't follow alice back)",
      aliceInBobFollowers?.isFollowed === false,
      `got ${aliceInBobFollowers?.isFollowed}`);
    assert("bob's followers[alice].isMutuallyFollowing === false",
      aliceInBobFollowers?.isMutuallyFollowing === false,
      `got ${aliceInBobFollowers?.isMutuallyFollowing}`);
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nState 3 — mutual (bob also follows alice)");
  await follow(bob.token, alice.user.id);
  ok("bob → POST /api/follow {alice}");

  {
    const bobFromAlice = await getProfile(alice.token, bobUserName);
    assertProfileFlags("alice→bob profile (mutual)", bobFromAlice, {
      isFollowedByMe: true, isFollowedByThem: true, isMutuallyFollowing: true,
    });

    const aliceFromBob = await getProfile(bob.token, aliceUserName);
    assertProfileFlags("bob→alice profile (mutual)", aliceFromBob, {
      isFollowedByMe: true, isFollowedByThem: true, isMutuallyFollowing: true,
    });

    const aliceFollowing = await getFollowingList(alice.token);
    assert("alice's following[bob].isMutuallyFollowing === true",
      findRow(aliceFollowing, bobUserName)?.isMutuallyFollowing === true);

    const bobFollowing = await getFollowingList(bob.token);
    assert("bob's following[alice].isMutuallyFollowing === true",
      findRow(bobFollowing, aliceUserName)?.isMutuallyFollowing === true);

    const aliceFollowers = await getFollowersList(alice.token);
    assert("alice's followers[bob].isFollowed === true",
      findRow(aliceFollowers, bobUserName)?.isFollowed === true);
    assert("alice's followers[bob].isMutuallyFollowing === true",
      findRow(aliceFollowers, bobUserName)?.isMutuallyFollowing === true);

    const bobFollowers = await getFollowersList(bob.token);
    assert("bob's followers[alice].isFollowed === true",
      findRow(bobFollowers, aliceUserName)?.isFollowed === true);
    assert("bob's followers[alice].isMutuallyFollowing === true",
      findRow(bobFollowers, aliceUserName)?.isMutuallyFollowing === true);
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nState 4 — alice unfollows bob (back to one-way: bob→alice)");
  await unfollow(alice.token, bob.user.id);
  ok("alice → DELETE /api/follow/[bob]");

  {
    const bobFromAlice = await getProfile(alice.token, bobUserName);
    assertProfileFlags("alice→bob profile (after unfollow)", bobFromAlice, {
      isFollowedByMe: false, isFollowedByThem: true, isMutuallyFollowing: false,
    });

    const aliceFromBob = await getProfile(bob.token, aliceUserName);
    assertProfileFlags("bob→alice profile (after unfollow)", aliceFromBob, {
      isFollowedByMe: true, isFollowedByThem: false, isMutuallyFollowing: false,
    });

    const aliceFollowing = await getFollowingList(alice.token);
    assert("alice's following list no longer contains bob",
      !findRow(aliceFollowing, bobUserName));

    const aliceFollowers = await getFollowersList(alice.token);
    const bobInAliceFollowers = findRow(aliceFollowers, bobUserName);
    assert("alice's followers list still contains bob (he follows her)",
      !!bobInAliceFollowers);
    assert("alice's followers[bob].isFollowed === false (alice no longer follows back)",
      bobInAliceFollowers?.isFollowed === false);
    assert("alice's followers[bob].isMutuallyFollowing === false",
      bobInAliceFollowers?.isMutuallyFollowing === false);
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nNotification rows — mutual flag reflects CURRENT state, not history");
  // Reset, then make Bob follow Alice (creates a 'follow' notification),
  // then have Bob unfollow Alice (notification row remains, but mutual must be false).
  await ensureUnfollowed(alice.token, bob.user.id);
  await ensureUnfollowed(bob.token, alice.user.id);

  await follow(bob.token, alice.user.id);
  ok("bob followed alice (creates notification)");
  {
    const notif = await getFollowerNotifications(alice.token);
    const bobRow = notif.find((row) => row.userName === bobUserName);
    assert("notification: bob row exists for alice", !!bobRow);
    assert("notification: bob.isFollowed === false (alice does not follow bob yet)",
      bobRow?.isFollowed === false, `got ${bobRow?.isFollowed}`);
    assert("notification: bob.isMutuallyFollowing === false (one-way)",
      bobRow?.isMutuallyFollowing === false, `got ${bobRow?.isMutuallyFollowing}`);
  }

  await follow(alice.token, bob.user.id);
  ok("alice followed bob back");
  {
    const notif = await getFollowerNotifications(alice.token);
    const bobRow = notif.find((row) => row.userName === bobUserName);
    assert("notification: bob.isFollowed === true after alice follows back",
      bobRow?.isFollowed === true);
    assert("notification: bob.isMutuallyFollowing === true (truly mutual)",
      bobRow?.isMutuallyFollowing === true, `got ${bobRow?.isMutuallyFollowing}`);
  }

  // The bug case: Bob silently unfollows Alice. Notification row stays;
  // mutual MUST become false even though alice still follows bob.
  await unfollow(bob.token, alice.user.id);
  ok("bob unfollowed alice (silent)");
  {
    const notif = await getFollowerNotifications(alice.token);
    const bobRow = notif.find((row) => row.userName === bobUserName);
    assert("notification: bob row still present (history preserved)",
      !!bobRow);
    assert("notification: bob.isFollowed === true (alice still follows bob)",
      bobRow?.isFollowed === true);
    assert("notification: bob.isMutuallyFollowing === false (NOT mutual anymore)",
      bobRow?.isMutuallyFollowing === false, `got ${bobRow?.isMutuallyFollowing}`);
  }

  // Restore mutual: Bob follows Alice again — flag must flip back to true.
  await follow(bob.token, alice.user.id);
  ok("bob followed alice again");
  {
    const notif = await getFollowerNotifications(alice.token);
    const bobRow = notif.find((row) => row.userName === bobUserName);
    assert("notification: bob.isMutuallyFollowing === true after restoring",
      bobRow?.isMutuallyFollowing === true);
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCleanup — restore initial state");
  await ensureUnfollowed(alice.token, bob.user.id);
  await ensureUnfollowed(bob.token, alice.user.id);
  ok("bob unfollowed alice");

  // ─────────────────────────────────────────────────────────
  console.log("\nResult");
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? ` :: ${f.detail}` : ""}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(2);
});
