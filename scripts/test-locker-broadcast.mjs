#!/usr/bin/env node
// End-to-end smoke test for the SFSC locker broadcast feature.
// Hits a running buhub_back instance over HTTP — exercises the same
// admin/mobile API surface the production app uses.
//
// Usage:
//   API_URL=http://localhost:3000 ADMIN_EMAIL=eve@buhub.test ADMIN_PASSWORD=Password123 \
//   node scripts/test-locker-broadcast.mjs

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "eve@buhub.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Password123";

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
  if (cond) ok(name);
  else fail(name, detail);
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
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

async function loginAsAdmin() {
  const res = await call("POST", "/api/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (res.status !== 200 || !res.json?.success || !res.json.token) {
    throw new Error(`admin login failed: ${res.status} ${res.text}`);
  }
  if (res.json.user?.role !== "ADMIN") {
    throw new Error(`logged-in user is not ADMIN: ${res.json.user?.role}`);
  }
  return res.json.token;
}

async function run() {
  console.log(`SFSC locker broadcast smoke test`);
  console.log(`  API: ${API_URL}`);
  console.log(`  admin: ${ADMIN_EMAIL}\n`);

  console.log("Auth");
  const adminToken = await loginAsAdmin();
  ok("admin login returns ADMIN role + token");

  // Try a regular USER for mobile-side checks. Fall back to admin if no seed user logs in.
  let userToken = adminToken;
  let userIsRegular = false;
  for (const cred of [
    { email: "alice@buhub.test", password: "Password123" },
    { email: "23245322@life.hkbu.edu.hk", password: "Password123" },
    { email: "bob@buhub.test", password: "Password123" },
  ]) {
    const r = await call("POST", "/api/auth/login", { body: cred });
    if (r.status === 200 && r.json?.token && r.json.user?.role !== "ADMIN") {
      userToken = r.json.token;
      userIsRegular = true;
      ok(`regular user login works (${cred.email})`);
      break;
    }
  }
  if (!userIsRegular) {
    fail("regular user login", "no seed USER could log in; will reuse admin token for mobile checks");
  }

  console.log("\nAdmin GET /api/admin/locker-broadcast");
  {
    const r = await call("GET", "/api/admin/locker-broadcast", { token: adminToken });
    assert("returns 200", r.status === 200, `got ${r.status} ${r.text}`);
    assert("success=true", r.json?.success === true);
    const d = r.json?.data ?? {};
    assert("data has message field", typeof d.message === "string");
    assert("data has featureEnabled boolean", typeof d.featureEnabled === "boolean");
    assert("data has openAt + closeAt", "openAt" in d && "closeAt" in d);
    assert("data has isPublished boolean", typeof d.isPublished === "boolean");
  }

  console.log("\nAdmin PATCH — validation");
  {
    const open = "2026-05-01T00:00:00+08:00";
    const close = "2026-05-01T00:00:00+08:00"; // equal — should reject
    const r = await call("PATCH", "/api/admin/locker-broadcast", {
      token: adminToken,
      body: { openAt: open, closeAt: close },
    });
    assert("rejects openAt >= closeAt with 400", r.status === 400, `got ${r.status}`);
    assert(
      "error code is VALIDATION_ERROR",
      r.json?.error?.code === "VALIDATION_ERROR"
    );
  }
  console.log("\nAdmin PATCH — set timeline + message + publish");
  const testMessage = `[smoke test] please collect by 5/20 — ${Date.now()}`;
  const openAt  = "2026-05-01T00:00:00+08:00";
  const closeAt = "2026-05-20T23:59:59+08:00";
  {
    const r = await call("PATCH", "/api/admin/locker-broadcast", {
      token: adminToken,
      body: {
        action: "publish",
        message: testMessage,
        featureEnabled: true,
        openAt,
        closeAt,
      },
    });
    assert("returns 200", r.status === 200, `got ${r.status} ${r.text}`);
    assert("success=true", r.json?.success === true);
    const d = r.json?.data ?? {};
    assert("message persisted", d.message === testMessage);
    assert("featureEnabled persisted", d.featureEnabled === true);
    assert("openAt persisted", new Date(d.openAt).toISOString() === new Date(openAt).toISOString());
    assert("closeAt persisted", new Date(d.closeAt).toISOString() === new Date(closeAt).toISOString());
    assert("isPublished true after publish action", d.isPublished === true);
  }

  console.log("\nMobile GET /api/locker-broadcast — after publish");
  {
    const r = await call("GET", "/api/locker-broadcast", { token: userToken });
    assert("returns 200", r.status === 200, `got ${r.status} ${r.text}`);
    assert("success=true", r.json?.success === true);
    const d = r.json?.data ?? {};
    assert("message visible to user", d.message === testMessage);
    assert("featureEnabled exposed", typeof d.featureEnabled === "boolean");
    assert(
      "timeline fields exposed",
      "openAt" in d && "closeAt" in d
    );
  }

  console.log("\nAdmin PATCH — withdraw");
  {
    const r = await call("PATCH", "/api/admin/locker-broadcast", {
      token: adminToken,
      body: { action: "withdraw" },
    });
    assert("returns 200", r.status === 200, `got ${r.status}`);
    assert("isPublished=false after withdraw", r.json?.data?.isPublished === false);
  }

  console.log("\nMobile GET /api/locker-broadcast — after withdraw");
  {
    const r = await call("GET", "/api/locker-broadcast", { token: userToken });
    assert("returns 200", r.status === 200);
    assert(
      "message hidden when not published",
      r.json?.data?.message === null
    );
  }

  console.log("\nAuth gating");
  {
    const r = await call("GET", "/api/admin/locker-broadcast"); // no token
    assert("admin GET requires auth", r.status === 401 || r.status === 403, `got ${r.status}`);
  }
  if (userIsRegular) {
    const r = await call("PATCH", "/api/admin/locker-broadcast", {
      token: userToken,
      body: { message: "should be rejected" },
    });
    assert("non-admin PATCH rejected with 401/403", r.status === 401 || r.status === 403, `got ${r.status}`);
  } else {
    console.log("  - skipped non-admin PATCH check: no regular user available");
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

run().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(2);
});
