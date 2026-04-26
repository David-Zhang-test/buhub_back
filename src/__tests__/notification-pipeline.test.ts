import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Static-analysis tests for the push notification pipeline.
// No DB / Next.js runtime required — locks in the wiring so a future refactor
// that disconnects (e.g.) the messages POST handler from sendPushToUser, or
// the cron scheduler from server.js, surfaces here immediately.

const FILES = {
  cronRoute: resolve(__dirname, "../../app/api/cron/expire/route.ts"),
  taskPushService: resolve(__dirname, "../services/task-push.service.ts"),
  expoPushService: resolve(__dirname, "../services/expo-push.service.ts"),
  messagesRoute: resolve(__dirname, "../../app/api/messages/route.ts"),
  notifSettingsRoute: resolve(
    __dirname,
    "../../app/api/notifications/settings/route.ts"
  ),
  serverJs: resolve(__dirname, "../../server.js"),
} as const;

const cache = new Map<keyof typeof FILES, string>();
const read = (key: keyof typeof FILES): string => {
  const cached = cache.get(key);
  if (cached) return cached;
  const text = readFileSync(FILES[key], "utf-8");
  cache.set(key, text);
  return text;
};

beforeAll(() => {
  for (const k of Object.keys(FILES) as (keyof typeof FILES)[]) read(k);
});

// ---------------------------------------------------------------------------
// PART 1 — Task reminder pipeline (system pushes for expiring/expired posts)
// ---------------------------------------------------------------------------

describe("TASK-REMINDER-01 — /api/cron/expire wires expire + both pushes", () => {
  it("imports the expire and task-push services", () => {
    const src = read("cronRoute");
    expect(src).toMatch(/from\s+["']@\/src\/services\/expire\.service["']/);
    expect(src).toMatch(/from\s+["']@\/src\/services\/task-push\.service["']/);
  });

  it("requires Authorization: Bearer ${CRON_SECRET}", () => {
    const src = read("cronRoute");
    expect(src).toMatch(/process\.env\.CRON_SECRET/);
    expect(src).toMatch(/authorization/i);
    expect(src).toMatch(/replace\(["']Bearer ["']/);
  });

  it("returns 401 when CRON_SECRET is missing or wrong", () => {
    const src = read("cronRoute");
    expect(src).toMatch(/status:\s*401/);
    expect(src).toMatch(/code:\s*"UNAUTHORIZED"/);
  });

  it("calls expireOldPosts then both push senders", () => {
    const src = read("cronRoute");
    expect(src).toMatch(/expireOldPosts\(/);
    expect(src).toMatch(/sendExpiringSoonTaskPushes\(/);
    expect(src).toMatch(/sendExpiredTaskPushes\(/);
  });
});

describe("TASK-REMINDER-02 — task-push.service emits the right event types", () => {
  it("uses type: 'task_expiring_soon' for the heads-up push", () => {
    const src = read("taskPushService");
    expect(src).toMatch(/type:\s*["']task_expiring_soon["']/);
  });

  it("uses type: 'task_expired' for the post-expiry push", () => {
    const src = read("taskPushService");
    expect(src).toMatch(/type:\s*["']task_expired["']/);
  });

  it("calls sendPushOnce so duplicate runs don't fire twice", () => {
    const src = read("taskPushService");
    expect(src).toMatch(/sendPushOnce/);
  });
});

describe("TASK-REMINDER-03 — task event types map to the 'system' preference", () => {
  const src = () => read("expoPushService");

  it("resolvePushCategory maps task_expiring_soon -> system", () => {
    expect(src()).toMatch(
      /case\s+["']task_expiring_soon["']:[\s\S]{0,80}?return\s+["']system["']/
    );
  });

  it("resolvePushCategory maps task_expired -> system", () => {
    expect(src()).toMatch(
      /case\s+["']task_expired["']:[\s\S]{0,80}?return\s+["']system["']/
    );
  });
});

describe("TASK-REMINDER-04 — server.js schedules the cron job", () => {
  const src = () => read("serverJs");

  it("declares an EXPIRE_INTERVAL_MS for the timer cadence", () => {
    expect(src()).toMatch(/EXPIRE_INTERVAL_MS\s*=\s*\d+\s*\*\s*\d+\s*\*\s*1000/);
  });

  it("registers a setInterval on runExpireJob", () => {
    expect(src()).toMatch(/setInterval\(runExpireJob,\s*EXPIRE_INTERVAL_MS\)/);
  });

  it("calls /api/cron/expire with Bearer ${CRON_SECRET} when secret is set", () => {
    expect(src()).toMatch(/process\.env\.CRON_SECRET/);
    expect(src()).toMatch(/\/api\/cron\/expire/);
    expect(src()).toMatch(/Authorization.*Bearer/);
  });

  it("falls back to inline expire when CRON_SECRET is missing", () => {
    expect(src()).toMatch(/runExpireInline/);
  });

  it("clears the interval on shutdown", () => {
    expect(src()).toMatch(/clearInterval\(expireTimer\)/);
  });
});

// ---------------------------------------------------------------------------
// PART 2 — Message notification pipeline (DM pushes)
// ---------------------------------------------------------------------------

describe("MESSAGE-NOTIF-01 — /api/messages POST sends a push to the receiver", () => {
  const src = () => read("messagesRoute");

  it("imports sendPushToUser + buildDirectMessagePushPreview", () => {
    expect(src()).toMatch(/sendPushToUser/);
    expect(src()).toMatch(/buildDirectMessagePushPreview/);
  });

  it("calls sendPushToUser with category: 'messages'", () => {
    expect(src()).toMatch(/category:\s*["']messages["']/);
  });

  it("targets the receiver, not the sender", () => {
    expect(src()).toMatch(/userId:\s*message\.receiverId/);
  });

  it("sets data.type = 'message' so resolvePushCategory routes correctly", () => {
    expect(src()).toMatch(/type:\s*["']message["']/);
  });
});

describe("MESSAGE-NOTIF-02 — message event maps to the 'messages' preference", () => {
  it("resolvePushCategory maps message -> messages", () => {
    const src = read("expoPushService");
    expect(src).toMatch(
      /case\s+["']message["']:[\s\S]{0,40}?return\s+["']messages["']/
    );
  });
});

// ---------------------------------------------------------------------------
// PART 3 — Preference enforcement is applied to ALL pushes
// ---------------------------------------------------------------------------

describe("PREFERENCE-ENFORCEMENT — both pipelines respect NotificationPreference", () => {
  const src = () => read("expoPushService");

  it("isPushEnabledForUser reads from NotificationPreference", () => {
    expect(src()).toMatch(/isPushEnabledForUser/);
    expect(src()).toMatch(/FROM\s+"NotificationPreference"/);
  });

  it("sendPushToUser short-circuits when preference is disabled", () => {
    expect(src()).toMatch(/isPushEnabledForUser/);
    expect(src()).toMatch(/skippedPreference:\s*true/);
  });

  it("sendPushOnce also gates by preference (used by task pushes)", () => {
    expect(src()).toMatch(/sendPushOnce/);
    expect(src()).toMatch(/resolvePushCategory/);
  });
});

// ---------------------------------------------------------------------------
// PART 4 — Settings GET/PUT round-trips for the toggle buttons
// ---------------------------------------------------------------------------

describe("SETTINGS-API — /api/notifications/settings persists every toggle", () => {
  const src = () => read("notifSettingsRoute");

  it("Zod schema accepts likes/comments/followers/messages/system", () => {
    expect(src()).toMatch(/likes:\s*z\.boolean/);
    expect(src()).toMatch(/comments:\s*z\.boolean/);
    expect(src()).toMatch(/followers:\s*z\.boolean/);
    expect(src()).toMatch(/messages:\s*z\.boolean/);
    expect(src()).toMatch(/system:\s*z\.boolean/);
  });

  it("GET selects all five fields from NotificationPreference", () => {
    expect(src()).toMatch(
      /SELECT[\s\S]{0,100}"likes"[\s\S]{0,100}"comments"[\s\S]{0,100}"followers"[\s\S]{0,100}"messages"[\s\S]{0,100}"system"/
    );
  });

  it("PUT upserts via INSERT ... ON CONFLICT", () => {
    expect(src()).toMatch(/INSERT INTO\s+"NotificationPreference"/);
    expect(src()).toMatch(/ON CONFLICT\s*\(\s*"userId"\s*\)\s*DO UPDATE/);
  });

  it("GET defaults to enabled-for-everything if the user has no row yet", () => {
    expect(src()).toMatch(/DEFAULT_SETTINGS/);
    expect(src()).toMatch(/likes:\s*true/);
    expect(src()).toMatch(/messages:\s*true/);
    expect(src()).toMatch(/system:\s*true/);
  });
});
