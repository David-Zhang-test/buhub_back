import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Source file paths (read as text -- no DB or Next.js runtime needed)
// ---------------------------------------------------------------------------

const FEEDBACK_ROUTE = resolve(
  __dirname,
  "../../../../app/api/feedback/route.ts"
);
const FEEDBACK_ID_ROUTE = resolve(
  __dirname,
  "../../../../app/api/feedback/[id]/route.ts"
);
const ERROR_MESSAGES = resolve(
  __dirname,
  "../../../../src/lib/errorMessages.ts"
);

let feedbackRoute: string;
let feedbackIdRoute: string;
let errorMessages: string;

beforeAll(() => {
  feedbackRoute = readFileSync(FEEDBACK_ROUTE, "utf-8");
  feedbackIdRoute = readFileSync(FEEDBACK_ID_ROUTE, "utf-8");
  errorMessages = readFileSync(ERROR_MESSAGES, "utf-8");
});

// ---------------------------------------------------------------------------
// SUBMIT-04: POST route creates feedback and returns { success, data: { id } } with 201
// ---------------------------------------------------------------------------

describe("SUBMIT-04 -- POST /api/feedback route structure", () => {
  it("exports an async POST function", () => {
    expect(feedbackRoute).toMatch(/export\s+async\s+function\s+POST\s*\(/);
  });

  it("authenticates the user via getCurrentUser", () => {
    expect(feedbackRoute).toContain("getCurrentUser");
  });

  it("validates request body with createFeedbackSchema.parse()", () => {
    expect(feedbackRoute).toContain("createFeedbackSchema.parse(");
  });

  it("creates a Feedback record via prisma.feedback.create()", () => {
    expect(feedbackRoute).toContain("prisma.feedback.create(");
  });

  it("returns 201 status code", () => {
    expect(feedbackRoute).toContain("status: 201");
  });

  it("returns success:true with data.id in the response", () => {
    expect(feedbackRoute).toContain("success: true");
    expect(feedbackRoute).toContain("data: { id: feedback.id }");
  });
});

// ---------------------------------------------------------------------------
// HIST-01: GET /api/feedback returns paginated list for current user
// ---------------------------------------------------------------------------

describe("HIST-01 -- GET /api/feedback route structure", () => {
  it("exports an async GET function", () => {
    expect(feedbackRoute).toMatch(/export\s+async\s+function\s+GET\s*\(/);
  });

  it("authenticates the user via getCurrentUser", () => {
    // Already confirmed above, but this ensures GET path also uses auth
    expect(feedbackRoute).toContain("getCurrentUser");
  });

  it("filters by current user id (where: { userId: user.id })", () => {
    expect(feedbackRoute).toContain("userId: user.id");
  });

  it("implements pagination with page and limit query params", () => {
    expect(feedbackRoute).toContain('searchParams.get("page")');
    expect(feedbackRoute).toContain('searchParams.get("limit")');
    expect(feedbackRoute).toContain("skip");
    expect(feedbackRoute).toContain("take: limit");
  });

  it("returns total count alongside data", () => {
    expect(feedbackRoute).toContain("prisma.feedback.count(");
    expect(feedbackRoute).toMatch(/data[\s\S]*total/);
  });
});

// ---------------------------------------------------------------------------
// HIST-02: List items include category, description, status, createdAt
// ---------------------------------------------------------------------------

describe("HIST-02 -- GET /api/feedback select clause includes required fields", () => {
  it("selects category in the response", () => {
    expect(feedbackRoute).toMatch(/select:\s*\{[\s\S]*?category:\s*true/);
  });

  it("selects description in the response", () => {
    expect(feedbackRoute).toMatch(/select:\s*\{[\s\S]*?description:\s*true/);
  });

  it("selects status in the response", () => {
    expect(feedbackRoute).toMatch(/select:\s*\{[\s\S]*?status:\s*true/);
  });

  it("selects createdAt in the response", () => {
    expect(feedbackRoute).toMatch(/select:\s*\{[\s\S]*?createdAt:\s*true/);
  });
});

// ---------------------------------------------------------------------------
// HIST-03: GET /api/feedback/[id] returns detail with replies; uses FEEDBACK_NOT_FOUND
// ---------------------------------------------------------------------------

describe("HIST-03 -- GET /api/feedback/[id] route structure", () => {
  it("exports an async GET function", () => {
    expect(feedbackIdRoute).toMatch(/export\s+async\s+function\s+GET\s*\(/);
  });

  it("authenticates the user via getCurrentUser", () => {
    expect(feedbackIdRoute).toContain("getCurrentUser");
  });

  it("fetches by id with prisma.feedback.findUnique()", () => {
    expect(feedbackIdRoute).toContain("prisma.feedback.findUnique(");
  });

  it("includes replies with admin info", () => {
    expect(feedbackIdRoute).toContain("replies:");
    expect(feedbackIdRoute).toContain("admin:");
  });

  it("returns FEEDBACK_NOT_FOUND error code when not found or wrong user", () => {
    expect(feedbackIdRoute).toContain('"FEEDBACK_NOT_FOUND"');
    expect(feedbackIdRoute).toContain("status: 404");
  });

  it("uses getErrorMessage to produce localized error message", () => {
    expect(feedbackIdRoute).toContain('getErrorMessage("FEEDBACK_NOT_FOUND"');
  });
});

// ---------------------------------------------------------------------------
// HIST-03 (supplementary): errorMessages.ts has FEEDBACK_NOT_FOUND in en/sc/tc
// ---------------------------------------------------------------------------

describe("HIST-03 -- FEEDBACK_NOT_FOUND error message has all 3 languages", () => {
  it("has an English message for FEEDBACK_NOT_FOUND", () => {
    expect(errorMessages).toMatch(
      /FEEDBACK_NOT_FOUND[\s\S]*?en:\s*["']Feedback not found["']/
    );
  });

  it("has a Simplified Chinese message for FEEDBACK_NOT_FOUND", () => {
    expect(errorMessages).toMatch(
      /FEEDBACK_NOT_FOUND[\s\S]*?sc:\s*["']/
    );
  });

  it("has a Traditional Chinese message for FEEDBACK_NOT_FOUND", () => {
    expect(errorMessages).toMatch(
      /FEEDBACK_NOT_FOUND[\s\S]*?tc:\s*["']/
    );
  });
});
