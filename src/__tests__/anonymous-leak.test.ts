import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { pushT } from "../lib/push-i18n";

// Anonymous-identity leak audit. Static-analysis + runtime checks that lock
// in every guard along the chain so a future refactor that removes a check
// surfaces here immediately. Mirrors notification-pipeline.test.ts style.
//
// Covered surfaces (each must independently respect Post.isAnonymous /
// Comment.isAnonymous):
//
//   1. Schema     — only Post + Comment have isAnonymous; Like + Bookmark
//                   do not, so those actors are intentionally always shown.
//   2. Push body  — comments/route.ts wraps actor in anonymity-aware ternary
//                   for the three push call sites (top-level / reply / @).
//   3. Push i18n  — actor.anonymous fallback key exists in tc/sc/en.
//   4. New post   — broadcastNewPostPush picks anon body; WebSocket post:new
//                   skipped entirely for anonymous posts.
//   5. Forum GET  — author name/avatar/gender/grade/major/meta gated by
//                   post.isAnonymous; authorId/userName never serialized.
//   6. Notif GET  — /api/notifications/comments swaps in anonymousIdentity
//                   when comment.isAnonymous, blanks userName, masks gender.
//   7. WS event   — notification:new payload carries only notificationType +
//                   createdAt, no actor identity.

const FILES = {
  schema: resolve(__dirname, "../../prisma/schema.prisma"),
  pushI18n: resolve(__dirname, "../lib/push-i18n.ts"),
  expoPush: resolve(__dirname, "../services/expo-push.service.ts"),
  newPostPush: resolve(__dirname, "../services/new-post-push.service.ts"),
  postsRoute: resolve(__dirname, "../../app/api/forum/posts/route.ts"),
  commentsRoute: resolve(
    __dirname,
    "../../app/api/forum/posts/[id]/comments/route.ts"
  ),
  notifCommentsRoute: resolve(
    __dirname,
    "../../app/api/notifications/comments/route.ts"
  ),
  postLikeRoute: resolve(
    __dirname,
    "../../app/api/forum/posts/[id]/like/route.ts"
  ),
  postBookmarkRoute: resolve(
    __dirname,
    "../../app/api/forum/posts/[id]/bookmark/route.ts"
  ),
  commentLikeRoute: resolve(
    __dirname,
    "../../app/api/comments/[id]/like/route.ts"
  ),
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
// PART 1 — Schema: which models can be anonymous
// ---------------------------------------------------------------------------

describe("ANON-SCHEMA-01 — only Post and Comment carry isAnonymous", () => {
  it("Post model has isAnonymous + anonymousName + anonymousAvatar", () => {
    const src = read("schema");
    const postBlock = src.match(/model Post\s*\{[\s\S]+?\n\}/)?.[0] ?? "";
    expect(postBlock).toMatch(/isAnonymous\s+Boolean/);
    expect(postBlock).toMatch(/anonymousName\s+String\?/);
    expect(postBlock).toMatch(/anonymousAvatar\s+String\?/);
  });

  it("Comment model has isAnonymous + anonymousName + anonymousAvatar", () => {
    const src = read("schema");
    const commentBlock = src.match(/model Comment\s*\{[\s\S]+?\n\}/)?.[0] ?? "";
    expect(commentBlock).toMatch(/isAnonymous\s+Boolean/);
    expect(commentBlock).toMatch(/anonymousName\s+String\?/);
    expect(commentBlock).toMatch(/anonymousAvatar\s+String\?/);
  });

  it("Like model does NOT carry anonymity fields (likers always shown)", () => {
    const src = read("schema");
    const likeBlock = src.match(/model Like\s*\{[\s\S]+?\n\}/)?.[0] ?? "";
    expect(likeBlock).not.toMatch(/isAnonymous/);
    expect(likeBlock).not.toMatch(/anonymousName/);
  });

  it("Bookmark model does NOT carry anonymity fields (bookmarkers always shown)", () => {
    const src = read("schema");
    const bookmarkBlock =
      src.match(/model Bookmark\s*\{[\s\S]+?\n\}/)?.[0] ?? "";
    expect(bookmarkBlock).not.toMatch(/isAnonymous/);
    expect(bookmarkBlock).not.toMatch(/anonymousName/);
  });
});

// ---------------------------------------------------------------------------
// PART 2 — Comment push body anonymity guards (the 3 leaks we just fixed)
// ---------------------------------------------------------------------------

describe("ANON-PUSH-01 — comment-create push wraps actor in isAnonymous ternary", () => {
  it("imports actor.anonymous fallback key via pushT", () => {
    const src = read("commentsRoute");
    expect(src).toMatch(/pushT\([^)]+,\s*["']actor\.anonymous["']/);
  });

  // The route may compose actor display either inline at each push site or
  // via a centralized helper (e.g. actorLabel = (lang) => isAnonymous ? ...).
  // Both are acceptable — the contract is that the value passed as `actor:`
  // to pushT() must trace to an isAnonymous check, never directly to
  // getActorDisplayName(user). The "canonical anonymity ternary" guard
  // below ensures the policy exists somewhere in the file; the per-tag
  // guards ensure no push site bypasses it via raw getActorDisplayName.
  it("file contains the canonical anonymity ternary at least once", () => {
    const src = read("commentsRoute");
    expect(src).toMatch(
      /data\.isAnonymous\s*\?[^;]*pushT\([^)]+,\s*["']actor\.anonymous["'][^;]*:\s*getActorDisplayName\(user\)/
    );
  });

  function assertActorIsAnonymityAware(tag: string): void {
    const src = read("commentsRoute");
    const escaped = tag.replace(/\./g, "\\.");
    const block = src.match(
      new RegExp(
        `pushT\\([^,]+,\\s*["']${escaped}["']\\s*,\\s*\\{[^}]*actor:\\s*([^,}\\s]+)`
      )
    );
    expect(block, `push call for ${tag} not found`).toBeTruthy();
    const actorExpr = block![1].trim();
    // Must NOT be a raw helper call — that would bypass anonymity.
    expect(actorExpr).not.toMatch(/^getActorDisplayName\b/);
  }

  it("top-level comment push (comment.post) uses anonymity-aware actor", () => {
    assertActorIsAnonymityAware("comment.post");
  });

  it("reply push (reply.comment) uses anonymity-aware actor", () => {
    assertActorIsAnonymityAware("reply.comment");
  });

  it("mention push (mention.comment) uses anonymity-aware actor", () => {
    assertActorIsAnonymityAware("mention.comment");
  });

  it("push-body anonymity branch reads .name not .serializedName", () => {
    // serializedName is a JSON blob of all 3 langs (correctly used at the
    // DB-write site, where the column stores all variants for later
    // re-localization). But in the *push body* context it would render as
    // literal JSON. The actor-display assignment must use .name.
    const src = read("commentsRoute");
    // Look only at lines that compose the push actor (assignment lines that
    // chain into pushT("actor.anonymous")).
    const actorLines = src.match(
      /anonymousIdentity\?\.\w+[^\n]*pushT\([^)]+,\s*["']actor\.anonymous["']/g
    );
    expect(
      actorLines,
      "expected at least one actor-display assignment using anonymousIdentity"
    ).toBeTruthy();
    for (const line of actorLines!) {
      expect(line).toContain("anonymousIdentity?.name");
      expect(line).not.toContain("anonymousIdentity?.serializedName");
    }
  });

  it("anonymity branch falls back to actor.anonymous i18n key when name is empty", () => {
    const src = read("commentsRoute");
    expect(src).toMatch(
      /anonymousIdentity\?\.name\?\.trim\(\)\s*\|\|\s*pushT\([^,]+,\s*["']actor\.anonymous["']/
    );
  });
});

// ---------------------------------------------------------------------------
// PART 3 — Push i18n contract: actor.anonymous key in all 3 langs
// ---------------------------------------------------------------------------

describe("ANON-I18N-01 — actor.anonymous key resolves in tc/sc/en", () => {
  it("tc returns a non-empty Chinese label, never the literal key", () => {
    const result = pushT("tc", "actor.anonymous");
    expect(result).not.toBe("actor.anonymous");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/匿名/);
  });

  it("sc returns a non-empty Chinese label, never the literal key", () => {
    const result = pushT("sc", "actor.anonymous");
    expect(result).not.toBe("actor.anonymous");
    expect(result).toMatch(/匿名/);
  });

  it("en returns the English fallback, never the literal key", () => {
    const result = pushT("en", "actor.anonymous");
    expect(result).not.toBe("actor.anonymous");
    expect(result.toLowerCase()).toContain("anonymous");
  });

  it("templated comment.post body with anon actor never embeds 'Bob' or any user-supplied identity", () => {
    // End-to-end: simulate the actual push body construction for an
    // anonymous comment. The string MUST contain the anon label and MUST
    // NOT contain a real user nickname.
    const anonName = "大澳龍"; // canonical TC anonymousIdentity.name
    const tc = pushT("tc", "comment.post", { actor: anonName });
    expect(tc).toContain(anonName);
    expect(tc).not.toContain("Bob");
    expect(tc).not.toMatch(/[a-z]+_bu/i); // catches userName patterns like bob_bu
  });
});

// ---------------------------------------------------------------------------
// PART 4 — New-post broadcast: both push and WebSocket honor isAnonymous
// ---------------------------------------------------------------------------

describe("ANON-NEW-POST-01 — broadcastNewPostPush picks anon body", () => {
  it("new-post-push.service branches on isAnonymous", () => {
    const src = read("newPostPush");
    expect(src).toMatch(/isAnonymous/);
    expect(src).toMatch(/new_post\.anon_body/);
  });

  it("new_post.anon_body i18n key contains no actor placeholder", () => {
    const tc = pushT("tc", "new_post.anon_body");
    const sc = pushT("sc", "new_post.anon_body");
    const en = pushT("en", "new_post.anon_body");
    for (const body of [tc, sc, en]) {
      expect(body).not.toMatch(/\{actor\}/);
      expect(body).not.toBe("new_post.anon_body");
    }
  });
});

describe("ANON-NEW-POST-02 — WebSocket post:new is skipped for anonymous posts", () => {
  it("forum/posts POST guards messageEventBroker.broadcast with !data.isAnonymous", () => {
    const src = read("postsRoute");
    // The broadcast call must live inside an if-block that includes
    // !data.isAnonymous in the predicate.
    const broadcastWindow = src.match(
      /if\s*\([^)]*!\s*data\.isAnonymous[^)]*\)\s*\{[\s\S]{0,400}messageEventBroker\.broadcast/
    );
    expect(
      broadcastWindow,
      "messageEventBroker.broadcast must be gated on !data.isAnonymous"
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PART 5 — GET /api/forum/posts strips author identity for anonymous posts
// ---------------------------------------------------------------------------

describe("ANON-FORUM-GET-01 — anonymous post serialization hides author", () => {
  it("avatar/name/gender/grade/major/meta all use post.isAnonymous ? ... : ... ternary", () => {
    const src = read("postsRoute");
    const ternaryFields = [
      "avatar",
      "name",
      "gender",
      "gradeKey",
      "majorKey",
      "meta",
    ];
    for (const field of ternaryFields) {
      const re = new RegExp(`${field}:\\s*post\\.isAnonymous\\s*\\?`);
      expect(src, `${field} must be guarded by post.isAnonymous`).toMatch(re);
    }
  });

  it("response object never includes raw authorId or userName fields at top level", () => {
    const src = read("postsRoute");
    // Find the hydrated.map(...) return object range — the per-post output.
    const returnBlock = src.match(/return\s*\{\s*id:\s*post\.id,[\s\S]+?\};/);
    expect(returnBlock).toBeTruthy();
    const block = returnBlock![0];
    // These keys, if present at the top level, would defeat anonymity.
    // (isOwnedByCurrentUser is allowed — it's a derived boolean.)
    expect(block).not.toMatch(/^\s*authorId:/m);
    expect(block).not.toMatch(/^\s*userName:/m);
  });

  it("blocked-user filter exempts anonymous posts to avoid de-anonymization via block-set inference", () => {
    const src = read("postsRoute");
    // The where.NOT filter excludes anonymous posts from the block check
    // (i.e., anon posts are NOT auto-hidden when their author is blocked).
    expect(src).toMatch(
      /where\.NOT\s*=\s*\{[^}]*authorId:\s*\{\s*in:\s*blockedUserIds\s*\}[^}]*isAnonymous:\s*false/
    );
  });
});

// ---------------------------------------------------------------------------
// PART 6 — GET /api/notifications/comments uses anonymousIdentity
// ---------------------------------------------------------------------------

describe("ANON-NOTIF-GET-01 — comment notification list anonymizes actor", () => {
  it("imports resolveAnonymousIdentity helper", () => {
    const src = read("notifCommentsRoute");
    expect(src).toMatch(/resolveAnonymousIdentity/);
  });

  it("user/userName/gender all branch on comment.isAnonymous", () => {
    const src = read("notifCommentsRoute");
    // user comes from anonymousIdentity?.name when anonymous (|| not ??:
    // empty-string anon name should fall through to actor.nickname rather
    // than ship "" to the client and render as a blank avatar bubble).
    expect(src).toMatch(/anonymousIdentity\?\.name\s*\|\|\s*n\.actor/);
    // userName is blanked when anonymous
    expect(src).toMatch(
      /userName:\s*comment\?\.isAnonymous\s*\?\s*["']{2}\s*:/
    );
    // gender is masked when anonymous
    expect(src).toMatch(/gender:\s*comment\?\.isAnonymous\s*\?\s*["']secret["']/);
  });

  it("isAnonymous flag is propagated to client so UI can render lock badge", () => {
    const src = read("notifCommentsRoute");
    expect(src).toMatch(/isAnonymous:\s*Boolean\(comment\?\.isAnonymous\)/);
  });
});

// ---------------------------------------------------------------------------
// PART 7 — WebSocket notification:new payload carries no actor info
// ---------------------------------------------------------------------------

describe("ANON-WS-01 — notification:new event carries only type + timestamp", () => {
  const forbiddenKeys = ["actorId", "userId", "userName", "nickname", "avatar"];

  it("comment-create publish has no actor identity in payload", () => {
    const src = read("commentsRoute");
    // Find every messageEventBroker.publish(...) block and inspect the
    // object passed in.
    const blocks = src.matchAll(
      /messageEventBroker\.publish\([^,]+,\s*\{([^}]+)\}/g
    );
    let count = 0;
    for (const m of blocks) {
      count++;
      const body = m[1];
      for (const forbidden of forbiddenKeys) {
        expect(
          body,
          `comments/route messageEventBroker.publish payload must not include ${forbidden}`
        ).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
      }
      // Sanity: the payload references the expected canonical keys.
      expect(body).toMatch(/notificationType:\s*["']comment["']/);
      expect(body).toMatch(/createdAt:/);
    }
    expect(
      count,
      "expected at least 2 publish blocks (comment + mention)"
    ).toBeGreaterThanOrEqual(2);
  });

  it("post-like publish has no actor identity in payload", () => {
    const src = read("postLikeRoute");
    const block = src.match(
      /messageEventBroker\.publish\([^,]+,\s*\{([^}]+)\}/
    );
    expect(block).toBeTruthy();
    for (const forbidden of forbiddenKeys) {
      expect(block![1]).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(block![1]).toMatch(/notificationType:\s*["']like["']/);
  });

  it("comment-like publish has no actor identity in payload", () => {
    const src = read("commentLikeRoute");
    const block = src.match(
      /messageEventBroker\.publish\([^,]+,\s*\{([^}]+)\}/
    );
    expect(block).toBeTruthy();
    for (const forbidden of forbiddenKeys) {
      expect(block![1]).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });
});

// ---------------------------------------------------------------------------
// PART 8 — Like/Bookmark push: confirmed always-displayed (these can't be
// anonymous, so showing actor identity is the correct, intended behavior;
// this test just locks in that getActorDisplayName(user) is not accidentally
// wrapped in an anonymity branch where none should exist).
// ---------------------------------------------------------------------------

describe("ANON-NON-LEAK-01 — likes and bookmarks intentionally show actor", () => {
  it("post-like push uses getActorDisplayName(user) directly (no anonymity to honor)", () => {
    const src = read("postLikeRoute");
    expect(src).toMatch(/actor:\s*getActorDisplayName\(user\)/);
  });

  it("post-bookmark push uses getActorDisplayName(user) directly", () => {
    const src = read("postBookmarkRoute");
    expect(src).toMatch(/actor:\s*getActorDisplayName\(user\)/);
  });

  it("comment-like push uses getActorDisplayName(user) directly", () => {
    const src = read("commentLikeRoute");
    expect(src).toMatch(/actor:\s*getActorDisplayName\(user\)/);
  });
});

// ---------------------------------------------------------------------------
// PART 9 — getActorDisplayName signature contract
// ---------------------------------------------------------------------------

describe("ANON-HELPER-01 — getActorDisplayName signature is non-anonymity-aware by design", () => {
  it("does not consume isAnonymous (callers are responsible for the ternary)", () => {
    const src = read("expoPush");
    const sig = src.match(/export function getActorDisplayName\([^)]*\)/);
    expect(sig).toBeTruthy();
    // Keeping isAnonymous OUT of this helper forces every caller to make
    // the policy decision explicitly. If the helper silently swallowed it,
    // a missing field in one call site would silently leak.
    expect(sig![0]).not.toMatch(/isAnonymous/);
  });
});
