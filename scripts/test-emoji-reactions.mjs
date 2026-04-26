#!/usr/bin/env node
// End-to-end emoji reaction test.
// Drives two seed users (alice, eve) through the reaction state machine:
//   - new emoji → adds (no replace)
//   - re-tap same emoji from same actor → toggles off
//   - empty emoji → legacy clear (drops that actor's whole set)
//   - reactions from both sides aggregate per emoji
//
// Mirrors the mobile aggregator semantics in
// BUHUB/src/api/services/message.service.ts so the script can verify what
// the recipient app would render.

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ALICE = { email: "23245322@life.hkbu.edu.hk", password: "Password123" };
// Use eve (ADMIN) as the second account — only HKBU-verified or ADMIN users
// pass the messaging gate, and eve is the only seed admin.
const BOB = { email: "eve@buhub.test", password: "Password123" };

const REACTION_PREFIX = "[BUHUB_REACTION]";

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
  if (token) headers.authorization = `Bearer ${token}`;
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

async function sendMessage(token, receiverId, content) {
  const r = await call("POST", "/api/messages", {
    token,
    body: { receiverId, content, images: [] },
  });
  if (r.status !== 200 || !r.json?.success) {
    throw new Error(`sendMessage failed: ${r.status} ${r.text}`);
  }
  return r.json.message ?? r.json.data ?? r.json;
}

async function sendReaction(token, receiverId, targetMessageId, emoji) {
  const content = `${REACTION_PREFIX}${JSON.stringify({ messageId: targetMessageId, emoji })}`;
  return sendMessage(token, receiverId, content);
}

async function getChatHistory(token, partnerId) {
  const r = await call("GET", `/api/messages/chat/${partnerId}?limit=100`, { token });
  if (r.status !== 200) throw new Error(`getChatHistory: ${r.status} ${r.text}`);
  const data = r.json?.data ?? r.json ?? {};
  return data.messages ?? [];
}

// Mirrors BUHUB/src/api/services/message.service.ts — Set-based toggle aggregator.
// Uses `isMine` from the API row (per-requester perspective).
function aggregateReactions(rawMessages, targetMessageId) {
  const reactionEvents = rawMessages
    .map((m) => {
      const content = m.content ?? "";
      if (!content.startsWith(REACTION_PREFIX)) return null;
      try {
        const payload = JSON.parse(content.slice(REACTION_PREFIX.length));
        return {
          messageId: payload?.messageId,
          emoji: payload?.emoji ?? "",
          isMine: Boolean(m.isMine),
          createdAt: m.createdAt,
        };
      } catch {
        return null;
      }
    })
    .filter((p) => p && p.messageId === targetMessageId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const meSet = new Set();
  const themSet = new Set();
  for (const r of reactionEvents) {
    const set = r.isMine ? meSet : themSet;
    if (r.emoji) {
      if (set.has(r.emoji)) set.delete(r.emoji);
      else set.add(r.emoji);
    } else {
      set.clear();
    }
  }

  const chips = new Map();
  meSet.forEach((e) => chips.set(e, { emoji: e, count: 1, reactedByMe: true }));
  themSet.forEach((e) => {
    const cur = chips.get(e);
    if (cur) cur.count += 1;
    else chips.set(e, { emoji: e, count: 1, reactedByMe: false });
  });
  return Array.from(chips.values()).sort((a, b) => a.emoji.localeCompare(b.emoji));
}

function reactionsEqual(a, b) {
  if (a.length !== b.length) return false;
  const sort = (xs) => [...xs].sort((p, q) => p.emoji.localeCompare(q.emoji));
  const sa = sort(a), sb = sort(b);
  return sa.every((x, i) => x.emoji === sb[i].emoji && x.count === sb[i].count && x.reactedByMe === sb[i].reactedByMe);
}

function describe(reactions) {
  return reactions.map((r) => `${r.emoji}×${r.count}${r.reactedByMe ? "(me)" : ""}`).join(" ") || "[]";
}

async function run() {
  console.log("Emoji reaction end-to-end test");
  console.log(`  API: ${API_URL}`);
  console.log(`  Alice: ${ALICE.email}`);
  console.log(`  Bob:   ${BOB.email}\n`);

  console.log("Auth");
  const alice = await login(ALICE);
  const bob = await login(BOB);
  ok(`alice login (id=${alice.user.id.slice(0, 8)}…)`);
  ok(`bob login (id=${bob.user.id.slice(0, 8)}…)`);

  // Open both directions so neither hits the cold-start limit later.
  console.log("\nOpen bidirectional chat");
  await sendMessage(alice.token, bob.user.id, "hi from alice");
  ok("alice → bob: 'hi from alice'");
  await sendMessage(bob.token, alice.user.id, "hello back from bob");
  ok("bob → alice: 'hello back from bob'");

  // ─────────────────────────────────────────────────────────
  console.log("\nCase A — single reaction (Bob reacts 👍 to Alice's msg)");
  const t1 = await sendMessage(alice.token, bob.user.id, "case A target");
  await sendReaction(bob.token, alice.user.id, t1.id, "👍");
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t1.id);
    const expected = [{ emoji: "👍", count: 1, reactedByMe: false }];
    assert(`alice's view: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }
  {
    const hist = await getChatHistory(bob.token, alice.user.id);
    const r = aggregateReactions(hist, t1.id);
    const expected = [{ emoji: "👍", count: 1, reactedByMe: true }];
    assert(`bob's view: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCase B — second emoji from same user (must accumulate, NOT replace)");
  const t2 = await sendMessage(alice.token, bob.user.id, "case B target");
  await sendReaction(bob.token, alice.user.id, t2.id, "👍");
  await sendReaction(bob.token, alice.user.id, t2.id, "❤️");
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t2.id);
    const expected = [
      { emoji: "❤️", count: 1, reactedByMe: false },
      { emoji: "👍", count: 1, reactedByMe: false },
    ];
    assert(`both emojis present: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCase C — re-tap same emoji toggles off");
  const t3 = await sendMessage(alice.token, bob.user.id, "case C target");
  await sendReaction(bob.token, alice.user.id, t3.id, "👍");
  await sendReaction(bob.token, alice.user.id, t3.id, "❤️");
  await sendReaction(bob.token, alice.user.id, t3.id, "👍"); // toggles off
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t3.id);
    const expected = [{ emoji: "❤️", count: 1, reactedByMe: false }];
    assert(`only ❤️ remains: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCase D — both users react with the same emoji (count=2)");
  const t4 = await sendMessage(alice.token, bob.user.id, "case D target");
  await sendReaction(bob.token, alice.user.id, t4.id, "👍");
  await sendReaction(alice.token, bob.user.id, t4.id, "👍");
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t4.id);
    const expected = [{ emoji: "👍", count: 2, reactedByMe: true }];
    assert(`alice's view: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }
  {
    const hist = await getChatHistory(bob.token, alice.user.id);
    const r = aggregateReactions(hist, t4.id);
    const expected = [{ emoji: "👍", count: 2, reactedByMe: true }];
    assert(`bob's view: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCase E — cross-user mix");
  const t5 = await sendMessage(alice.token, bob.user.id, "case E target");
  await sendReaction(bob.token, alice.user.id, t5.id, "👍");
  await sendReaction(bob.token, alice.user.id, t5.id, "❤️");
  await sendReaction(alice.token, bob.user.id, t5.id, "🎉");
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t5.id);
    const expected = [
      { emoji: "❤️", count: 1, reactedByMe: false },
      { emoji: "🎉", count: 1, reactedByMe: true },
      { emoji: "👍", count: 1, reactedByMe: false },
    ];
    assert(`alice: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }
  {
    const hist = await getChatHistory(bob.token, alice.user.id);
    const r = aggregateReactions(hist, t5.id);
    const expected = [
      { emoji: "❤️", count: 1, reactedByMe: true },
      { emoji: "🎉", count: 1, reactedByMe: false },
      { emoji: "👍", count: 1, reactedByMe: true },
    ];
    assert(`bob:   ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCase F — legacy empty emoji clears that actor's set");
  const t6 = await sendMessage(alice.token, bob.user.id, "case F target");
  await sendReaction(bob.token, alice.user.id, t6.id, "👍");
  await sendReaction(bob.token, alice.user.id, t6.id, "❤️");
  await sendReaction(bob.token, alice.user.id, t6.id, ""); // legacy clear
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t6.id);
    assert(`bob's reactions cleared (got ${describe(r)})`, r.length === 0);
  }

  // ─────────────────────────────────────────────────────────
  console.log("\nCase G — three different emojis from same user (no replace)");
  const t7 = await sendMessage(alice.token, bob.user.id, "case G target");
  await sendReaction(bob.token, alice.user.id, t7.id, "👍");
  await sendReaction(bob.token, alice.user.id, t7.id, "❤️");
  await sendReaction(bob.token, alice.user.id, t7.id, "🎉");
  {
    const hist = await getChatHistory(alice.token, bob.user.id);
    const r = aggregateReactions(hist, t7.id);
    const expected = [
      { emoji: "❤️", count: 1, reactedByMe: false },
      { emoji: "🎉", count: 1, reactedByMe: false },
      { emoji: "👍", count: 1, reactedByMe: false },
    ];
    assert(`all three persist: ${describe(expected)} (got ${describe(r)})`,
      reactionsEqual(r, expected));
  }

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
