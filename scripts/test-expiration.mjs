#!/usr/bin/env node
// End-to-end expiration test.
// Verifies the deadline → expired-status pipeline mirrors
// src/services/expire.service.ts:expireOldPosts():
//   - rows with expiresAt < NOW   AND expired=false → flipped to expired=true
//   - rows with expiresAt >= NOW  AND expired=false → stay expired=false
//   - rows already expired=true                      → unchanged (idempotent)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_TAG = `__test_expiration_${Date.now()}`;

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

const HOUR = 60 * 60 * 1000;
const PAST = () => new Date(Date.now() - 1 * HOUR);
const FUTURE = () => new Date(Date.now() + 24 * HOUR);

async function getAuthorId() {
  const u = await prisma.user.findFirst({
    where: { emails: { some: { email: { endsWith: "@life.hkbu.edu.hk" } } } },
    select: { id: true },
  });
  if (!u) throw new Error("No HKBU-verified seed user found; run prisma seed first");
  return u.id;
}

async function seedPartner(authorId, expiresAt, alreadyExpired = false) {
  return prisma.partnerPost.create({
    data: {
      category: "OTHER",
      type: "study",
      title: `${TEST_TAG} partner ${alreadyExpired ? "preExpired" : ""} ${expiresAt.toISOString()}`,
      description: "expiration test row",
      time: expiresAt.toISOString(),
      location: "Test",
      authorId,
      expired: alreadyExpired,
      expiresAt,
    },
  });
}

async function seedErrand(authorId, expiresAt, alreadyExpired = false) {
  return prisma.errand.create({
    data: {
      category: "OTHER",
      type: "errand",
      title: `${TEST_TAG} errand ${alreadyExpired ? "preExpired" : ""} ${expiresAt.toISOString()}`,
      description: "expiration test row",
      from: "A", to: "B", price: "0", item: "n/a",
      time: expiresAt.toISOString(),
      authorId,
      expired: alreadyExpired,
      expiresAt,
    },
  });
}

async function seedSecondhand(authorId, expiresAt, alreadyExpired = false) {
  return prisma.secondhandItem.create({
    data: {
      category: "OTHER",
      type: "item",
      title: `${TEST_TAG} sh ${alreadyExpired ? "preExpired" : ""} ${expiresAt.toISOString()}`,
      description: "expiration test row",
      price: "0",
      condition: "good",
      location: "Test",
      images: [],
      authorId,
      expired: alreadyExpired,
      expiresAt,
    },
  });
}

// Mirror src/services/expire.service.ts:expireOldPosts.
async function runExpireJob() {
  const now = new Date();
  const [partnerResult, errandResult, secondhandResult] = await Promise.all([
    prisma.partnerPost.updateMany({
      where: { expired: false, expiresAt: { lt: now } },
      data: { expired: true },
    }),
    prisma.errand.updateMany({
      where: { expired: false, expiresAt: { lt: now } },
      data: { expired: true },
    }),
    prisma.secondhandItem.updateMany({
      where: { expired: false, expiresAt: { lt: now } },
      data: { expired: true },
    }),
  ]);
  return { partner: partnerResult.count, errand: errandResult.count, secondhand: secondhandResult.count };
}

async function readExpired(table, id) {
  if (table === "partner")    return prisma.partnerPost.findUnique({ where: { id }, select: { expired: true, expiresAt: true } });
  if (table === "errand")     return prisma.errand.findUnique({ where: { id }, select: { expired: true, expiresAt: true } });
  /* secondhand */            return prisma.secondhandItem.findUnique({ where: { id }, select: { expired: true, expiresAt: true } });
}

async function teardown(ids) {
  await Promise.all([
    prisma.partnerPost.deleteMany({ where: { id: { in: ids.partner } } }),
    prisma.errand.deleteMany({ where: { id: { in: ids.errand } } }),
    prisma.secondhandItem.deleteMany({ where: { id: { in: ids.secondhand } } }),
  ]);
}

async function run() {
  console.log("Deadline → expired-status pipeline test\n");

  const ids = { partner: [], errand: [], secondhand: [] };

  try {
    console.log("Setup");
    const authorId = await getAuthorId();
    ok(`got HKBU-verified author id=${authorId.slice(0, 8)}…`);

    const partnerPast      = await seedPartner(authorId, PAST());
    const partnerFuture    = await seedPartner(authorId, FUTURE());
    const partnerPreExpire = await seedPartner(authorId, PAST(), true);
    ids.partner.push(partnerPast.id, partnerFuture.id, partnerPreExpire.id);

    const errandPast       = await seedErrand(authorId, PAST());
    const errandFuture     = await seedErrand(authorId, FUTURE());
    const errandPreExpire  = await seedErrand(authorId, PAST(), true);
    ids.errand.push(errandPast.id, errandFuture.id, errandPreExpire.id);

    const shPast           = await seedSecondhand(authorId, PAST());
    const shFuture         = await seedSecondhand(authorId, FUTURE());
    const shPreExpire      = await seedSecondhand(authorId, PAST(), true);
    ids.secondhand.push(shPast.id, shFuture.id, shPreExpire.id);
    ok("seeded 9 rows (3 past, 3 future, 3 already-expired) across partner/errand/secondhand");

    // ────────────────────────────────
    console.log("\nPre-expire — verify seeded state");
    {
      const r = await readExpired("partner", partnerPast.id);
      assert("partner past:    expired=false (before job)", r.expired === false);
    }
    {
      const r = await readExpired("partner", partnerFuture.id);
      assert("partner future:  expired=false (before job)", r.expired === false);
    }
    {
      const r = await readExpired("partner", partnerPreExpire.id);
      assert("partner already-expired: expired=true (before job)", r.expired === true);
    }

    // ────────────────────────────────
    console.log("\nRun expire job");
    const counts = await runExpireJob();
    ok(`updateMany counts: partner=${counts.partner}, errand=${counts.errand}, secondhand=${counts.secondhand}`);
    assert("partner job flipped exactly 1 row (the past-deadline one)",
      counts.partner === 1, `got ${counts.partner}`);
    assert("errand job flipped exactly 1 row",
      counts.errand === 1, `got ${counts.errand}`);
    assert("secondhand job flipped exactly 1 row",
      counts.secondhand === 1, `got ${counts.secondhand}`);

    // ────────────────────────────────
    console.log("\nPost-expire — past-deadline rows");
    for (const [table, label, id] of [
      ["partner",    "partner past",    partnerPast.id],
      ["errand",     "errand past",     errandPast.id],
      ["secondhand", "secondhand past", shPast.id],
    ]) {
      const row = await readExpired(table, id);
      assert(`${label}: expired=true after job`,
        row?.expired === true, `got ${row?.expired}`);
    }

    console.log("\nPost-expire — future-deadline rows");
    for (const [table, label, id] of [
      ["partner",    "partner future",    partnerFuture.id],
      ["errand",     "errand future",     errandFuture.id],
      ["secondhand", "secondhand future", shFuture.id],
    ]) {
      const row = await readExpired(table, id);
      assert(`${label}: expired=false (deadline still in the future)`,
        row?.expired === false, `got ${row?.expired}`);
    }

    console.log("\nPost-expire — already-expired rows (idempotent)");
    for (const [table, label, id] of [
      ["partner",    "partner already-expired",    partnerPreExpire.id],
      ["errand",     "errand already-expired",     errandPreExpire.id],
      ["secondhand", "secondhand already-expired", shPreExpire.id],
    ]) {
      const row = await readExpired(table, id);
      assert(`${label}: expired=true unchanged`,
        row?.expired === true, `got ${row?.expired}`);
    }

    // ────────────────────────────────
    console.log("\nIdempotency — running the job again should change nothing");
    const second = await runExpireJob();
    assert("second run: partner updateMany count == 0",    second.partner === 0,    `got ${second.partner}`);
    assert("second run: errand updateMany count == 0",     second.errand === 0,     `got ${second.errand}`);
    assert("second run: secondhand updateMany count == 0", second.secondhand === 0, `got ${second.secondhand}`);

    // ────────────────────────────────
    console.log("\nFuture-deadline boundary — flip a future row's deadline into the past, re-run job");
    const justBefore = new Date(Date.now() - 30 * 1000);
    await prisma.partnerPost.update({
      where: { id: partnerFuture.id },
      data: { expiresAt: justBefore },
    });
    const third = await runExpireJob();
    assert("after pushing partner-future into the past, next run flips it (count >= 1)",
      third.partner >= 1, `got ${third.partner}`);
    {
      const row = await readExpired("partner", partnerFuture.id);
      assert("the previously-future partner row is now expired=true",
        row?.expired === true, `got ${row?.expired}`);
    }
  } finally {
    console.log("\nCleanup");
    await teardown(ids);
    ok("removed all test rows");
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
