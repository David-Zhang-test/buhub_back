#!/usr/bin/env node
// End-to-end rating score test.
// Verifies the user spec:
//   if one user enters 20/20/20 and another enters 30/30/30,
//   the headline overall score should be ((20+20+20)/3 + (30+30+30)/3) / 2 = 25
//   and each per-criterion bar should show 25.
//
// The mobile pipeline collects 0..100 form values and `normalizeScoreForSubmit`
// divides by 20 before posting (because the API schema accepts only 0..5).
// This script submits the post-mobile-normalization values directly:
//   form 20 → API 1.0, form 30 → API 1.5.
//
// Setup:
//   - Seeds one fresh RatingItem (TEACHER) directly via Prisma so the
//     assertions don't depend on whatever the env already contains.
//   - Cleans up the item + its Rating rows at the end.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ALICE = { email: "23245322@life.hkbu.edu.hk", password: "Password123" };
// Eve is ADMIN — bypasses HKBU email gate, same as the messaging flow.
const EVE = { email: "eve@buhub.test", password: "Password123" };

const TEST_ITEM_NAME = `__test_score_pipeline__ ${Date.now()}`;

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }
function fail(name, detail) {
  failed += 1;
  failures.push({ name, detail });
  console.log(`  ✗ ${name}`);
  if (detail) console.log(`      ${detail}`);
}
function assert(name, cond, detail) { if (cond) ok(name); else fail(name, detail); }

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

async function submitRating(token, itemId, scores) {
  const r = await call("POST", `/api/ratings/teacher/${itemId}/rate`, {
    token,
    body: { scores, tags: [] },
  });
  if (r.status !== 200) throw new Error(`submitRating failed: ${r.status} ${r.text}`);
  return r.json;
}

async function fetchListItem(token, itemId) {
  // Search for the test item by querying the full list. The list cache is
  // invalidated by submitRatingForItem on each submit.
  const r = await call("GET", `/api/ratings/teacher?limit=200`, { token });
  if (r.status !== 200) throw new Error(`getList: ${r.status} ${r.text}`);
  const items = r.json?.data?.items ?? r.json?.items ?? [];
  return items.find((x) => x.id === itemId) ?? null;
}

async function fetchDetailItem(token, itemId) {
  const r = await call("GET", `/api/ratings/teacher/${itemId}`, { token });
  if (r.status !== 200) throw new Error(`getDetail: ${r.status} ${r.text}`);
  return r.json?.data ?? r.json ?? null;
}

async function setup() {
  // Touch dimensions so the seed function can ensure they exist.
  await prisma.scoreDimension.findMany({ where: { category: "TEACHER" }, take: 1 });

  const created = await prisma.ratingItem.create({
    data: {
      category: "TEACHER",
      name: TEST_ITEM_NAME,
      department: "Test Dept",
      code: null,
      email: `pipeline-test-${Date.now()}@hkbu.edu.hk`,
      location: null,
      avatar: null,
    },
  });
  return created.id;
}

async function teardown(itemId) {
  if (!itemId) return;
  try {
    await prisma.rating.deleteMany({ where: { itemId } });
    await prisma.ratingItem.delete({ where: { id: itemId } });
  } catch (e) {
    console.log(`  ! cleanup warning: ${e.message}`);
  }
}

async function run() {
  console.log("Rating score pipeline end-to-end test");
  console.log(`  API: ${API_URL}`);
  console.log(`  Alice: ${ALICE.email}`);
  console.log(`  Eve:   ${EVE.email}\n`);

  let itemId = null;
  try {
    console.log("Auth");
    const alice = await login(ALICE);
    const eve = await login(EVE);
    ok(`alice login (id=${alice.user.id.slice(0, 8)}…)`);
    ok(`eve login (id=${eve.user.id.slice(0, 8)}…)`);

    console.log("\nSetup — seed a fresh TEACHER rating item");
    itemId = await setup();
    ok(`created RatingItem id=${itemId}`);

    // ─────────────────────────────────────────────────────────
    console.log("\nSubmit ratings — user spec (20/20/20 vs 30/30/30)");
    // Schema accepts 0..100 directly (post fix). Submit raw form values.
    await submitRating(alice.token, itemId, {
      teaching: 20,
      grading: 20,
      accessibility: 20,
    });
    ok("alice submitted 20/20/20");

    await submitRating(eve.token, itemId, {
      teaching: 30,
      grading: 30,
      accessibility: 30,
    });
    ok("eve submitted 30/30/30");

    // ─────────────────────────────────────────────────────────
    console.log("\nList endpoint — verify per-dim averages and headline overall");
    {
      const item = await fetchListItem(alice.token, itemId);
      assert("test item appears in list", !!item);
      assert("ratingCount === 2", item?.ratingCount === 2,
        `got ${item?.ratingCount}`);

      const byKey = Object.fromEntries((item?.scores ?? []).map((s) => [s.key, s.value]));
      assert("teaching displayed = 25 (avg of 20 and 30)",
        byKey.teaching === 25, `got ${byKey.teaching}`);
      assert("grading displayed = 25",
        byKey.grading === 25, `got ${byKey.grading}`);
      assert("accessibility displayed = 25",
        byKey.accessibility === 25, `got ${byKey.accessibility}`);

      // The user spec: ((20+20+20)/3 + (30+30+30)/3) / 2 = (20+30)/2 = 25.
      // Equivalent to: average of the per-dim averages = (25+25+25)/3 = 25.
      assert("overallScore from API = 25",
        item?.overallScore === 25, `got ${item?.overallScore}`);

      // Mobile RatingListScreen now derives the headline from scores[].value
      // (matches RatingDetailScreen). Replicate that math here.
      const computed = item?.scores?.length
        ? Math.round(item.scores.reduce((s, x) => s + x.value, 0) / item.scores.length)
        : 0;
      assert("mobile-derived headline (round avg of bars) = 25",
        computed === 25, `got ${computed}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nDetail endpoint — same ground truth from the per-item API");
    {
      const item = await fetchDetailItem(alice.token, itemId);
      assert("detail returns the item", !!item);
      const byKey = Object.fromEntries((item?.scores ?? []).map((s) => [s.key, s.value]));
      assert("detail teaching = 25", byKey.teaching === 25, `got ${byKey.teaching}`);
      assert("detail grading = 25", byKey.grading === 25, `got ${byKey.grading}`);
      assert("detail accessibility = 25", byKey.accessibility === 25, `got ${byKey.accessibility}`);
      assert("detail overallScore = 25", item?.overallScore === 25, `got ${item?.overallScore}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nExtra coverage — non-uniform inputs (40/60/80 vs 20/40/60)");
    // alice: 40,60,80   eve: 20,40,60
    // Per-dim displayed: avg(40,20)=30, avg(60,40)=50, avg(80,60)=70
    // Overall: avg(30,50,70) = 50
    await submitRating(alice.token, itemId, { teaching: 40, grading: 60, accessibility: 80 });
    await submitRating(eve.token,   itemId, { teaching: 20, grading: 40, accessibility: 60 });
    ok("alice/eve resubmitted with non-uniform values (updates existing rows)");
    {
      const item = await fetchListItem(alice.token, itemId);
      const byKey = Object.fromEntries((item?.scores ?? []).map((s) => [s.key, s.value]));
      assert("teaching = 30 (avg of 40 and 20)",       byKey.teaching === 30,      `got ${byKey.teaching}`);
      assert("grading = 50",                            byKey.grading === 50,        `got ${byKey.grading}`);
      assert("accessibility = 70",                      byKey.accessibility === 70,  `got ${byKey.accessibility}`);
      assert("overallScore = 50 (avg of 30, 50, 70)",   item?.overallScore === 50,   `got ${item?.overallScore}`);
    }
  } finally {
    console.log("\nCleanup");
    await teardown(itemId);
    ok(itemId ? "removed test item + ratings" : "nothing to clean up");
    await prisma.$disconnect();
  }

  console.log("\nResult");
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? ` :: ${f.detail}` : ""}`);
    process.exit(1);
  }
}

run().catch(async (err) => {
  console.error("\nFATAL:", err.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
