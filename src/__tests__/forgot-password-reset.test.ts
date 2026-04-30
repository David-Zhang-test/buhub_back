import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { generateResetCode } from "../services/auth.service";

// ---------------------------------------------------------------------------
// Comprehensive tests for the forgot-password / reset-password security
// overhaul. Locks in the wiring decisions behind issues F1-F8 so a future
// refactor that weakens any of them surfaces here immediately.
//
// Style mirrors notification-pipeline.test.ts: cheap static-analysis on the
// real source files (no Prisma / Redis / network needed) plus pure-function
// behavioural tests for the CSPRNG reset code generator.
// ---------------------------------------------------------------------------

const FILES = {
  authService: resolve(__dirname, "../services/auth.service.ts"),
  forgotRoute: resolve(__dirname, "../../app/api/auth/forgot-password/route.ts"),
  resetRoute: resolve(__dirname, "../../app/api/auth/reset-password/route.ts"),
  loginRoute: resolve(__dirname, "../../app/api/auth/login/route.ts"),
  mobileAuthService: resolve(
    __dirname,
    "../../../BUHUB/src/api/services/auth.service.ts"
  ),
  resetScreen: resolve(
    __dirname,
    "../../../BUHUB/src/screens/auth/ResetPasswordScreen.tsx"
  ),
} as const;

const cache = new Map<keyof typeof FILES, string>();
const read = (key: keyof typeof FILES): string => {
  const cached = cache.get(key);
  if (cached) return cached;
  const text = readFileSync(FILES[key], "utf8");
  cache.set(key, text);
  return text;
};

beforeAll(() => {
  for (const key of Object.keys(FILES) as (keyof typeof FILES)[]) read(key);
});

// ---------------------------------------------------------------------------
// 1. Pure-function behaviour: generateResetCode (CSPRNG)
// ---------------------------------------------------------------------------
describe("generateResetCode — F1 secure code generation", () => {
  it("returns a 6-digit string (compat with existing mobile UI)", () => {
    const code = generateResetCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("uses only ASCII digits 0-9", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateResetCode();
      expect(code).toMatch(/^[0-9]{6}$/);
    }
  });

  it("produces varied output (not deterministic)", () => {
    const samples = new Set<string>();
    for (let i = 0; i < 500; i += 1) samples.add(generateResetCode());
    // 500 draws from 1M space — at most a handful of collisions expected.
    // Demand >= 495 to catch a dud RNG without flaking.
    expect(samples.size).toBeGreaterThanOrEqual(495);
  });

  it("does not reuse Math.random() (defensive: source check)", () => {
    const src = read("authService");
    // Must import randomInt from "crypto" and call it inside the helper.
    expect(src).toMatch(/import\s*{[^}]*randomInt[^}]*}\s*from\s*["']crypto["']/);
    const helperBody = src.match(
      /export function generateResetCode\(\)[\s\S]+?\n\}/
    );
    expect(helperBody, "generateResetCode helper not found").toBeTruthy();
    // Strip // line comments so the assertion looks at executable code only.
    const codeOnly = helperBody![0].replace(/\/\/.*$/gm, "");
    expect(codeOnly).toContain("randomInt(");
    expect(codeOnly).not.toContain("Math.random");
  });
});

// ---------------------------------------------------------------------------
// 2. createVerificationToken — TTL + retry budget for password_reset
// ---------------------------------------------------------------------------
describe("createVerificationToken — F1/F3 token lifecycle", () => {
  it("declares a 6-character reset code length (compat with existing mobile UI)", () => {
    const src = read("authService");
    expect(src).toMatch(/RESET_CODE_LENGTH\s*=\s*6\b/);
  });

  it("uses 30-minute TTL for password_reset (not 24h)", () => {
    const src = read("authService");
    expect(src).toMatch(/PASSWORD_RESET_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
    // The createVerificationToken body must select the password_reset TTL.
    expect(src).toMatch(/type\s*===\s*"password_reset"\s*\?\s*PASSWORD_RESET_TTL_MS/);
  });

  it("retries up to 10 times on token collision (was 5)", () => {
    const src = read("authService");
    expect(src).toMatch(
      /maxAttempts\s*=\s*type\s*===\s*"password_reset"\s*\?\s*10\s*:\s*1/
    );
  });

  it("keeps 24h TTL for non-reset verification tokens", () => {
    const src = read("authService");
    expect(src).toMatch(/EMAIL_VERIFICATION_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
});

// ---------------------------------------------------------------------------
// 3. forgot-password route — per-email rate limit + silent skip (F4)
// ---------------------------------------------------------------------------
describe("forgot-password route — F4 mailbox-flood prevention", () => {
  it("imports the per-key rate-limit helper", () => {
    const src = read("forgotRoute");
    expect(src).toMatch(/checkCustomRateLimit/);
  });

  it("sets per-email limits at 1/min and 5/day", () => {
    const src = read("forgotRoute");
    expect(src).toMatch(/FORGOT_EMAIL_PER_MIN\s*=\s*1\b/);
    expect(src).toMatch(/FORGOT_EMAIL_PER_DAY\s*=\s*5\b/);
    expect(src).toMatch(/FORGOT_EMAIL_MIN_WINDOW_MS\s*=\s*60\s*\*\s*1000/);
    expect(src).toMatch(/FORGOT_EMAIL_DAY_WINDOW_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it("uses email-scoped Redis keys", () => {
    const src = read("forgotRoute");
    expect(src).toMatch(/`rl:forgot:email:\$\{email\}`/);
    expect(src).toMatch(/`rl:forgot:email:day:\$\{email\}`/);
  });

  it("only sends email when both throttle gates pass AND user exists", () => {
    const src = read("forgotRoute");
    // The `if` guarding sendEmail must AND together user, emailMinOk.allowed,
    // emailDayOk.allowed. Fail loudly if any of the conditions are dropped.
    const emailGuard = src.match(
      /if\s*\(\s*user\s*&&\s*emailMinOk\.allowed\s*&&\s*emailDayOk\.allowed\s*\)/
    );
    expect(emailGuard, "sendEmail guard missing rate-limit AND user check").toBeTruthy();
  });

  it("returns the same message regardless of rate-limit state (no enumeration)", () => {
    const src = read("forgotRoute");
    // Only one NextResponse.json with success:true body — the generic
    // "If your email is registered..." message — outside the IP-rate-limit
    // 429 branch. Multiple success responses would mean leakage.
    const successResponses = src.match(/NextResponse\.json\(\s*\{\s*\n?\s*success:\s*true/g) ?? [];
    expect(successResponses.length).toBe(1);
    expect(src).toMatch(/If your email is registered/);
  });

  it("references the new 30-minute TTL in the email body", () => {
    const src = read("forgotRoute");
    expect(src).toMatch(/30 minutes/);
    expect(src).not.toMatch(/24 hours/);
  });

  it("normalizes the email before all I/O (so case differences cannot bypass throttle)", () => {
    const src = read("forgotRoute");
    expect(src).toMatch(/const email\s*=\s*normalizeEmail\(parsed\.email\)/);
    // The rate-limit keys reference `email` (already normalised), not the raw input.
    expect(src).not.toMatch(/`rl:forgot:email:\$\{parsed\.email\}`/);
  });
});

// ---------------------------------------------------------------------------
// 4. reset-password route — F1+F2+F5 the security overhaul
// ---------------------------------------------------------------------------
describe("reset-password route — F1/F2/F5 brute-force + binding (compat-aware)", () => {
  it("accepts email as OPTIONAL (compat: old mobile clients omit it)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/email:\s*z\.string\(\)\.email\(\)\.optional\(\)/);
  });

  it("checks per-IP failure lock before any other work (F1)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/RESET_FAIL_MAX_PER_IP\s*=\s*5\b/);
    expect(src).toMatch(/RESET_FAIL_WINDOW_SECONDS\s*=\s*10\s*\*\s*60/);
    expect(src).toMatch(/`rl:reset:fail:ip:\$\{clientId\}`/);
    expect(src).toMatch(/`rl:reset:lock:ip:\$\{clientId\}`/);
    expect(src).toMatch(/code:\s*"TOO_MANY_ATTEMPTS"/);
  });

  it("declares a per-token failure throttle (compat-safety floor for old clients)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/RESET_FAIL_MAX_PER_TOKEN\s*=\s*3\b/);
    expect(src).toMatch(/`rl:reset:fail:token:\$\{token\}`/);
  });

  it("calls assertStrongPassword (Zod max only is not enough)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/assertStrongPassword\(newPassword\)/);
    expect(src).toMatch(/newPassword:\s*z\.string\(\)\.max\(100\)/);
    expect(src).not.toMatch(/newPassword:\s*z\.string\(\)\.min\(8\)/);
  });

  it("verifies token-owner ONLY when client supplies email (compat)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/if\s*\(suppliedEmail\)/);
    expect(src).toMatch(/findLoginIdentityByEmail\(suppliedEmail\)/);
    expect(src).toMatch(/verificationToken\.userId\s*!==\s*identity\.user\.id/);
  });

  it("preserves TOKEN_EXPIRED error code (compat: old mobile i18n maps it)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/code:\s*"TOKEN_EXPIRED"/);
  });

  it("returns INVALID_TOKEN for missing/wrong-type/wrong-owner (no enumeration)", () => {
    const src = read("resetRoute");
    const invalidTokenResponses = src.match(/code:\s*"INVALID_TOKEN"/g) ?? [];
    // One for missing/wrong-type, one for wrong-owner, one for missing user
    expect(invalidTokenResponses.length).toBeGreaterThanOrEqual(2);
  });

  it("burns expired token row immediately", () => {
    const src = read("resetRoute");
    // After detecting expiry, delete the row before responding.
    expect(src).toMatch(
      /if\s*\(new Date\(\)\s*>\s*verificationToken\.expiresAt\)\s*\{[\s\S]*?prisma\.verificationToken[\s\S]*?\.delete/
    );
  });

  it("burns wrong-owner-bound tokens via per-token failure counter", () => {
    const src = read("resetRoute");
    // recordFailure(true) on wrong-owner branch increments per-token, which
    // burns the row once the threshold is hit.
    expect(src).toMatch(/recordFailure\(true\)/);
    expect(src).toMatch(
      /if\s*\(tokenFailCount\s*>=\s*RESET_FAIL_MAX_PER_TOKEN\s*\)/
    );
  });

  it("does NOT charge per-token counter for unknown tokens (attacker doesn't know real ones)", () => {
    const src = read("resetRoute");
    // The unknown / wrong-type branch must call recordFailure(false).
    expect(src).toMatch(/recordFailure\(false\)/);
  });

  it("sets per-IP lock when failure count crosses threshold", () => {
    const src = read("resetRoute");
    expect(src).toMatch(
      /if\s*\(\s*ipFailCount\s*>=\s*RESET_FAIL_MAX_PER_IP\s*\)/
    );
    expect(src).toMatch(/redis\.set\(lockKey,\s*"1",\s*"EX",\s*RESET_FAIL_WINDOW_SECONDS\)/);
  });

  it("clears per-IP, per-token AND lock keys on successful reset", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/redis\.del\(ipKey\)/);
    expect(src).toMatch(/redis\.del\(lockKey\)/);
    expect(src).toMatch(/redis\.del\(tokenFailKey\)/);
  });

  it("returns BOTH legacy `message` AND new `token`+`user` (compat: old clients ignore extras)", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/createSession\(\s*user\.id/);
    expect(src).toMatch(/const userPayload\s*=\s*\{/);
    expect(src).toMatch(/role:\s*user\.role/);
    // Success response shape must include all three keys.
    const successBlock = src.match(
      /return NextResponse\.json\(\s*\{\s*success:\s*true,[\s\S]+?\}\s*\);/
    );
    expect(successBlock, "success response not found").toBeTruthy();
    expect(successBlock![0]).toMatch(/message:/);
    expect(successBlock![0]).toMatch(/token:\s*sessionToken/);
    expect(successBlock![0]).toMatch(/user:\s*userPayload/);
  });

  it("invalidates all existing sessions on successful reset", () => {
    const src = read("resetRoute");
    expect(src).toMatch(/authService\.logoutAllSessions\(user\.id\)/);
  });

  it("deletes the consumed verification token after success", () => {
    const src = read("resetRoute");
    // Multiple delete sites now: expired-burn, per-token burn, success.
    const deleteCalls = src.match(/prisma\.verificationToken[\s\S]{0,30}\.delete/g) ?? [];
    expect(deleteCalls.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 5. Mobile wire-format alignment (F2 + F7 + F8)
// ---------------------------------------------------------------------------
describe("mobile wire format — keeps client + server in lock-step", () => {
  it("authService.resetPassword takes (email, token, newPassword)", () => {
    const src = read("mobileAuthService");
    expect(src).toMatch(
      /async resetPassword\(\s*email:\s*string,\s*token:\s*string,\s*newPassword:\s*string\s*\)/
    );
    expect(src).toMatch(/email,\s*\n?\s*token,\s*\n?\s*newPassword/);
  });

  it("authService.resetPassword auto-stores the returned session token", () => {
    const src = read("mobileAuthService");
    // Inside resetPassword body: `if (data.token) { await setToken(data.token); }`.
    const resetBody = src.match(
      /async resetPassword\([\s\S]+?\n  \},/
    );
    expect(resetBody, "resetPassword body not found").toBeTruthy();
    expect(resetBody![0]).toMatch(/if \(data\.token\) \{\s*await setToken\(data\.token\);/);
  });

  it("ResetPasswordScreen renders 6 code boxes (matches existing UI / compat)", () => {
    const src = read("resetScreen");
    expect(src).toMatch(/CODE_LENGTH\s*=\s*6\b/);
  });

  it("ResetPasswordScreen calls setUser when backend returns auto-login token (F7)", () => {
    const src = read("resetScreen");
    expect(src).toMatch(/setUser\s*=\s*useAuthStore/);
    expect(src).toMatch(/setUser\(result\.user\)/);
    expect(src).toMatch(/setToken\(result\.token\)/);
  });

  it("ResetPasswordScreen falls back to navigate('Login') when backend omits token (compat)", () => {
    const src = read("resetScreen");
    // Old backend: result.token is undefined → must still bounce to Login.
    expect(src).toMatch(/navigation\.navigate\(\s*['"]Login['"]\s*\)/);
  });

  it("ResetPasswordScreen passes email to authService.resetPassword (new contract)", () => {
    const src = read("resetScreen");
    expect(src).toMatch(/authService\.resetPassword\(\s*email,\s*code\.join\(''\),\s*password\s*\)/);
  });
});
