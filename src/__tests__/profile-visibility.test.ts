import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  apiToDbVisibility,
  dbToApiVisibility,
  type ApiProfileVisibility,
} from "../lib/profile-visibility";

// --- Helper round-trips ----------------------------------------------------

describe("profile-visibility helpers — wire <-> Prisma enum", () => {
  it("converts API lowercase strings to Prisma enum values", () => {
    expect(apiToDbVisibility("public")).toBe("PUBLIC");
    expect(apiToDbVisibility("mutual")).toBe("MUTUAL");
    expect(apiToDbVisibility("hidden")).toBe("HIDDEN");
  });

  it("converts Prisma enum values to API lowercase strings", () => {
    expect(dbToApiVisibility("PUBLIC")).toBe("public");
    expect(dbToApiVisibility("MUTUAL")).toBe("mutual");
    expect(dbToApiVisibility("HIDDEN")).toBe("hidden");
  });

  it("round-trips for every API visibility value", () => {
    const values: ApiProfileVisibility[] = ["public", "mutual", "hidden"];
    for (const v of values) {
      expect(dbToApiVisibility(apiToDbVisibility(v))).toBe(v);
    }
  });
});

// --- Source-shape assertions on the route handlers -------------------------
//
// These are static-analysis tests so they don't need a live DB. They lock in
// the exact placement of the visibility gate so a future refactor can't
// silently move it back to the basic-profile route (regression of bug 13's
// follow-up where only the posts area is private).

const BASIC_PROFILE_ROUTE = resolve(
  __dirname,
  "../../app/api/user/[userName]/route.ts"
);
const POSTS_ROUTE = resolve(
  __dirname,
  "../../app/api/user/[userName]/posts/route.ts"
);
const PROFILE_ROUTE = resolve(
  __dirname,
  "../../app/api/user/profile/route.ts"
);
const SCHEMA = resolve(__dirname, "../schemas/user.schema.ts");
const MIGRATION = resolve(
  __dirname,
  "../../prisma/migrations/20260426010000_add_profile_visibility/migration.sql"
);

let basicProfileRoute: string;
let postsRoute: string;
let profileRoute: string;
let userSchema: string;
let migrationSql: string;

beforeAll(() => {
  basicProfileRoute = readFileSync(BASIC_PROFILE_ROUTE, "utf-8");
  postsRoute = readFileSync(POSTS_ROUTE, "utf-8");
  profileRoute = readFileSync(PROFILE_ROUTE, "utf-8");
  userSchema = readFileSync(SCHEMA, "utf-8");
  migrationSql = readFileSync(MIGRATION, "utf-8");
});

describe("VISIBILITY-01 — basic profile route does NOT enforce visibility", () => {
  it("does not return PROFILE_HIDDEN", () => {
    expect(basicProfileRoute).not.toMatch(/PROFILE_HIDDEN/);
  });

  it("does not branch on profileVisibility", () => {
    expect(basicProfileRoute).not.toMatch(/profileVisibility/);
  });

  it("still enforces the existing block check", () => {
    expect(basicProfileRoute).toMatch(/code:\s*"BLOCKED"/);
  });
});

describe("VISIBILITY-02 — posts route enforces visibility for non-owners", () => {
  it("returns PROFILE_HIDDEN when the target is HIDDEN", () => {
    expect(postsRoute).toMatch(/profileVisibility\s*===\s*"HIDDEN"/);
    expect(postsRoute).toMatch(/code:\s*"PROFILE_HIDDEN"/);
  });

  it("checks MUTUAL visibility against the Follow table", () => {
    expect(postsRoute).toMatch(/profileVisibility\s*===\s*"MUTUAL"/);
    expect(postsRoute).toMatch(/prisma\.follow\.findMany/);
  });

  it("requires both directions of the mutual-follow edge", () => {
    expect(postsRoute).toMatch(/iFollowThem/);
    expect(postsRoute).toMatch(/theyFollowMe/);
    expect(postsRoute).toMatch(/!iFollowThem\s*\|\|\s*!theyFollowMe/);
  });

  it("bypasses the gate when viewer is the owner", () => {
    expect(postsRoute).toMatch(/isOwner\s*=\s*currentUserId\s*===\s*targetUser\.id/);
    expect(postsRoute).toMatch(/if\s*\(\s*!isOwner\s*\)/);
  });
});

describe("VISIBILITY-03 — own-profile read/write surfaces the field", () => {
  it("GET selects profileVisibility from User", () => {
    expect(profileRoute).toMatch(/profileVisibility:\s*true/);
  });

  it("GET response uses dbToApiVisibility", () => {
    expect(profileRoute).toMatch(/dbToApiVisibility\(/);
  });

  it("PUT accepts profileVisibility via apiToDbVisibility", () => {
    expect(profileRoute).toMatch(/apiToDbVisibility\(/);
  });
});

describe("VISIBILITY-04 — Zod schema accepts the three values", () => {
  it("declares profileVisibility as an enum of public|mutual|hidden", () => {
    expect(userSchema).toMatch(
      /profileVisibility:\s*z\.enum\(\["public",\s*"mutual",\s*"hidden"\]\)/
    );
  });
});

describe("VISIBILITY-05 — Prisma migration is well-formed", () => {
  it("creates the ProfileVisibility enum with PUBLIC, MUTUAL, HIDDEN", () => {
    expect(migrationSql).toMatch(/CREATE TYPE "ProfileVisibility"/);
    expect(migrationSql).toMatch(
      /AS ENUM \('PUBLIC',\s*'MUTUAL',\s*'HIDDEN'\)/
    );
  });

  it("adds profileVisibility column to User with PUBLIC default", () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "User"\s+ADD COLUMN "profileVisibility"/
    );
    expect(migrationSql).toMatch(/DEFAULT 'PUBLIC'/);
    expect(migrationSql).toMatch(/NOT NULL/);
  });
});
