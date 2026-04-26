#!/usr/bin/env node
// Comprehensive locker-feature E2E test.
// Covers user-side submission/modification, admin-side review, and every
// constraint that recently shifted:
//   - HKBU email gate (requireLifeEmail)
//   - featureEnabled toggle
//   - openAt / closeAt window
//   - MAX_MODIFICATIONS = 1 (single modify after first submit; further blocked)
//   - schema validation (drop-off date enum, boxCount range)
//   - admin status patch + delete
//
// Snapshots the global broadcast row at startup and restores at teardown so
// the test never leaves your DB in a different state than it found it.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ALICE = { email: "23245322@life.hkbu.edu.hk", password: "Password123" };
const EVE   = { email: "eve@buhub.test",            password: "Password123" };

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
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, json, text };
}

async function login(creds) {
  const r = await call("POST", "/api/auth/login", { body: creds });
  if (r.status !== 200 || !r.json?.token) {
    throw new Error(`login failed for ${creds.email}: ${r.status} ${r.text}`);
  }
  return { token: r.json.token, user: r.json.user };
}

const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;

const VALID_BODY = {
  fullName: "Test Alice",
  studentId: "23245322",
  phoneNumber: "55512345",
  residenceAddress: "Cai Yuanpei Hall",
  dropOffDate: "2026-05-11",
  boxCount: 1,
};

async function setBroadcastWindow({ openAtMs, closeAtMs, featureEnabled = true }) {
  await prisma.lockerBroadcast.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      message: "",
      featureEnabled,
      openAt: new Date(openAtMs),
      closeAt: new Date(closeAtMs),
      dropOffDate1: new Date("2026-05-07T02:00:00Z"),
      dropOffDate2: new Date("2026-05-11T02:00:00Z"),
      dropOffDate3: new Date("2026-05-16T02:00:00Z"),
      isPublished: false,
    },
    update: {
      featureEnabled,
      openAt: new Date(openAtMs),
      closeAt: new Date(closeAtMs),
    },
  });
}

async function snapshotBroadcast() {
  return prisma.lockerBroadcast.findUnique({ where: { id: "global" } });
}

async function restoreBroadcast(snapshot) {
  if (!snapshot) {
    await prisma.lockerBroadcast.delete({ where: { id: "global" } }).catch(() => {});
    return;
  }
  await prisma.lockerBroadcast.upsert({
    where: { id: "global" },
    update: {
      message: snapshot.message,
      featureEnabled: snapshot.featureEnabled,
      openAt: snapshot.openAt,
      closeAt: snapshot.closeAt,
      dropOffDate1: snapshot.dropOffDate1,
      dropOffDate2: snapshot.dropOffDate2,
      dropOffDate3: snapshot.dropOffDate3,
      isPublished: snapshot.isPublished,
    },
    create: { ...snapshot, id: "global" },
  });
}

async function clearAliceRequest(aliceUserId) {
  await prisma.lockerRequest.deleteMany({ where: { userId: aliceUserId } });
}

async function run() {
  console.log("Locker feature end-to-end test");
  console.log(`  API: ${API_URL}`);
  console.log(`  Alice (HKBU): ${ALICE.email}`);
  console.log(`  Eve   (ADMIN): ${EVE.email}\n`);

  let snapshot = null;
  let alice = null;
  let eve = null;

  try {
    console.log("Auth");
    alice = await login(ALICE);
    eve   = await login(EVE);
    ok(`alice login (id=${alice.user.id.slice(0, 8)}…)`);
    ok(`eve   login (id=${eve.user.id.slice(0, 8)}…)`);

    console.log("\nSetup");
    snapshot = await snapshotBroadcast();
    ok(snapshot ? "snapshotted existing broadcast row" : "no existing broadcast row to snapshot");
    await clearAliceRequest(alice.user.id);
    ok("cleared any pre-existing locker request for alice");

    // ─────────────────────────────────────────────────────────
    console.log("\nA — featureEnabled=false locks all submissions");
    await setBroadcastWindow({
      openAtMs: Date.now() - HOUR,
      closeAtMs: Date.now() + DAY,
      featureEnabled: false,
    });
    {
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: VALID_BODY });
      assert("submit rejected with 403 when feature disabled", r.status === 403,
        `got ${r.status} ${r.text}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nB — before openAt: submissions rejected");
    await setBroadcastWindow({
      openAtMs: Date.now() + DAY,
      closeAtMs: Date.now() + 2 * DAY,
      featureEnabled: true,
    });
    {
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: VALID_BODY });
      assert("submit rejected with 403 before openAt", r.status === 403,
        `got ${r.status} ${r.text}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nC — after closeAt: submissions rejected");
    await setBroadcastWindow({
      openAtMs: Date.now() - 2 * DAY,
      closeAtMs: Date.now() - HOUR,
      featureEnabled: true,
    });
    {
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: VALID_BODY });
      assert("submit rejected with 403 after closeAt", r.status === 403,
        `got ${r.status} ${r.text}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nOpen the window for the rest of the test (now ± 1d)");
    await setBroadcastWindow({
      openAtMs: Date.now() - HOUR,
      closeAtMs: Date.now() + DAY,
      featureEnabled: true,
    });
    ok("window: openAt = -1h, closeAt = +24h, featureEnabled = true");

    // ─────────────────────────────────────────────────────────
    console.log("\nD — schema validation");
    {
      const bad = { ...VALID_BODY, dropOffDate: "2026-05-08" };
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: bad });
      assert("rejects invalid dropOffDate (not in enum) with 400", r.status === 400,
        `got ${r.status} ${r.text}`);
    }
    {
      const bad = { ...VALID_BODY, boxCount: 11 };
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: bad });
      assert("rejects boxCount > 10 with 400", r.status === 400, `got ${r.status}`);
    }
    {
      const bad = { ...VALID_BODY, boxCount: 0 };
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: bad });
      assert("rejects boxCount < 1 with 400", r.status === 400, `got ${r.status}`);
    }
    {
      const bad = { ...VALID_BODY, fullName: "" };
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: bad });
      assert("rejects empty fullName with 400", r.status === 400, `got ${r.status}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nE — first submission succeeds (modifyCount=0)");
    let createdId = null;
    {
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: VALID_BODY });
      assert("first submit returns 201", r.status === 201, `got ${r.status} ${r.text}`);
      assert("response carries data row", !!r.json?.data?.id);
      assert("modifyCount initialized to 0", r.json?.data?.modifyCount === 0,
        `got ${r.json?.data?.modifyCount}`);
      assert("status defaults to DROP_OFF_PROCESSING",
        r.json?.data?.status === "DROP_OFF_PROCESSING",
        `got ${r.json?.data?.status}`);
      createdId = r.json?.data?.id ?? null;
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nF — modify (1st time) succeeds, modifyCount→1");
    {
      const updated = { ...VALID_BODY, fullName: "Test Alice (modified)", boxCount: 2 };
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: updated });
      assert("modify returns 200", r.status === 200, `got ${r.status} ${r.text}`);
      assert("modifyCount incremented to 1", r.json?.data?.modifyCount === 1,
        `got ${r.json?.data?.modifyCount}`);
      assert("fullName persisted", r.json?.data?.fullName === "Test Alice (modified)");
      assert("boxCount persisted", r.json?.data?.boxCount === 2);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nG — modify again (exhaust) is rejected with 403");
    {
      const updated = { ...VALID_BODY, fullName: "Test Alice (3rd attempt)" };
      const r = await call("POST", "/api/locker-requests", { token: alice.token, body: updated });
      assert("second modify rejected with 403 (MAX_MODIFICATIONS=1)",
        r.status === 403, `got ${r.status} ${r.text}`);
      const row = await prisma.lockerRequest.findUnique({
        where: { userId: alice.user.id },
        select: { fullName: true, modifyCount: true },
      });
      assert("DB row unchanged after rejected modify",
        row?.fullName === "Test Alice (modified)" && row?.modifyCount === 1,
        `row=${JSON.stringify(row)}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nH — GET /api/locker-requests returns my record");
    {
      const r = await call("GET", "/api/locker-requests", { token: alice.token });
      assert("returns 200", r.status === 200, `got ${r.status}`);
      assert("data.id matches created row", r.json?.data?.id === createdId,
        `got ${r.json?.data?.id}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nI — auth gate: non-HKBU user (eve) cannot submit");
    {
      const r = await call("POST", "/api/locker-requests", { token: eve.token, body: VALID_BODY });
      assert("eve (admin without HKBU email) is rejected with 403",
        r.status === 403, `got ${r.status} ${r.text}`);
    }
    {
      const r = await call("POST", "/api/locker-requests", { body: VALID_BODY });
      assert("unauthenticated submit rejected with 401",
        r.status === 401, `got ${r.status}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nJ — admin: GET /api/admin/locker-requests lists alice's record");
    {
      const r = await call("GET", "/api/admin/locker-requests", { token: eve.token });
      assert("returns 200", r.status === 200, `got ${r.status} ${r.text}`);
      const items = r.json?.data?.items ?? r.json?.data ?? [];
      const alicesRow = (Array.isArray(items) ? items : []).find((row) => row?.id === createdId);
      assert("admin list contains alice's row", !!alicesRow);
    }
    {
      const r = await call("GET", "/api/admin/locker-requests", { token: alice.token });
      assert("non-admin GET admin list rejected with 401/403",
        r.status === 401 || r.status === 403, `got ${r.status}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nK — admin: PATCH status flips correctly");
    {
      const r = await call("PATCH", `/api/admin/locker-requests/${createdId}`, {
        token: eve.token,
        body: { status: "DROP_OFF_COMPLETE" },
      });
      assert("admin PATCH returns 200", r.status === 200, `got ${r.status} ${r.text}`);
      const row = await prisma.lockerRequest.findUnique({
        where: { id: createdId },
        select: { status: true },
      });
      assert("DB status updated to DROP_OFF_COMPLETE", row?.status === "DROP_OFF_COMPLETE",
        `got ${row?.status}`);
    }
    {
      const r = await call("PATCH", `/api/admin/locker-requests/${createdId}`, {
        token: eve.token,
        body: { status: "INVALID_STATUS" },
      });
      assert("admin PATCH with bogus status rejected with 400", r.status === 400,
        `got ${r.status}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nL — admin: DELETE removes the row");
    {
      const r = await call("DELETE", `/api/admin/locker-requests/${createdId}`, { token: eve.token });
      assert("admin DELETE returns 200", r.status === 200, `got ${r.status}`);
      const row = await prisma.lockerRequest.findUnique({ where: { id: createdId } });
      assert("DB row gone after delete", row === null);
    }
    {
      const r = await call("DELETE", `/api/admin/locker-requests/${createdId}`, { token: eve.token });
      assert("admin DELETE on already-deleted row returns 404", r.status === 404,
        `got ${r.status}`);
    }

    // ─────────────────────────────────────────────────────────
    console.log("\nM — broadcast: GET /api/locker-broadcast exposes timeline");
    {
      const r = await call("GET", "/api/locker-broadcast", { token: alice.token });
      assert("returns 200", r.status === 200, `got ${r.status}`);
      const d = r.json?.data ?? {};
      assert("featureEnabled boolean exposed", typeof d.featureEnabled === "boolean");
      assert("openAt + closeAt strings exposed", "openAt" in d && "closeAt" in d);
    }
  } finally {
    console.log("\nCleanup");
    if (alice?.user?.id) {
      await clearAliceRequest(alice.user.id);
      ok("removed alice's test locker request");
    }
    await restoreBroadcast(snapshot);
    ok("restored broadcast row to original snapshot");
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
