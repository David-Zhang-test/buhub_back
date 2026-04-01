import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// DATA-02: Migration SQL creates enums, tables, indexes, foreign keys
// ---------------------------------------------------------------------------

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../../prisma/migrations/20260331142350_add_feedback_tables/migration.sql"
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf-8");
});

describe("DATA-02 — Migration SQL creates feedback schema correctly", () => {
  // ── Enum creation ──────────────────────────────────────────────────────────

  it("creates FeedbackCategory enum with BUG, SUGGESTION, OTHER", () => {
    expect(sql).toContain('CREATE TYPE "FeedbackCategory" AS ENUM');
    expect(sql).toMatch(
      /CREATE TYPE "FeedbackCategory" AS ENUM\s*\(\s*'BUG',\s*'SUGGESTION',\s*'OTHER'\s*\)/
    );
  });

  it("creates FeedbackStatus enum with PENDING, REPLIED, RESOLVED", () => {
    expect(sql).toContain('CREATE TYPE "FeedbackStatus" AS ENUM');
    expect(sql).toMatch(
      /CREATE TYPE "FeedbackStatus" AS ENUM\s*\(\s*'PENDING',\s*'REPLIED',\s*'RESOLVED'\s*\)/
    );
  });

  // ── Table creation ─────────────────────────────────────────────────────────

  it("creates Feedback table with all required columns", () => {
    expect(sql).toContain('CREATE TABLE "Feedback"');
    expect(sql).toContain('"id" TEXT NOT NULL');
    expect(sql).toContain('"userId" TEXT NOT NULL');
    expect(sql).toContain('"category" "FeedbackCategory" NOT NULL');
    expect(sql).toContain('"description" TEXT NOT NULL');
    expect(sql).toContain('"imageUrls" TEXT[]');
    expect(sql).toContain('"status" "FeedbackStatus" NOT NULL DEFAULT \'PENDING\'');
    expect(sql).toMatch(/"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    expect(sql).toMatch(/"updatedAt" TIMESTAMP\(3\) NOT NULL/);
    expect(sql).toContain('"Feedback_pkey" PRIMARY KEY ("id")');
  });

  it("creates FeedbackReply table with all required columns", () => {
    expect(sql).toContain('CREATE TABLE "FeedbackReply"');
    expect(sql).toContain('"feedbackId" TEXT NOT NULL');
    expect(sql).toContain('"adminId" TEXT NOT NULL');
    expect(sql).toContain('"content" TEXT NOT NULL');
    expect(sql).toContain('"FeedbackReply_pkey" PRIMARY KEY ("id")');
  });

  // ── Index creation ─────────────────────────────────────────────────────────

  it("creates all Feedback indexes", () => {
    expect(sql).toContain('CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId")');
    expect(sql).toContain('CREATE INDEX "Feedback_status_idx" ON "Feedback"("status")');
    expect(sql).toContain('CREATE INDEX "Feedback_category_idx" ON "Feedback"("category")');
    expect(sql).toContain('CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt")');
  });

  it("creates all FeedbackReply indexes", () => {
    expect(sql).toContain(
      'CREATE INDEX "FeedbackReply_feedbackId_idx" ON "FeedbackReply"("feedbackId")'
    );
    expect(sql).toContain(
      'CREATE INDEX "FeedbackReply_adminId_idx" ON "FeedbackReply"("adminId")'
    );
  });

  // ── Foreign key constraints with CASCADE ───────────────────────────────────

  it("Feedback.userId FK references User(id) ON DELETE CASCADE", () => {
    expect(sql).toMatch(
      /ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/
    );
  });

  it("FeedbackReply.feedbackId FK references Feedback(id) ON DELETE CASCADE", () => {
    expect(sql).toMatch(
      /ALTER TABLE "FeedbackReply" ADD CONSTRAINT "FeedbackReply_feedbackId_fkey" FOREIGN KEY \("feedbackId"\) REFERENCES "Feedback"\("id"\) ON DELETE CASCADE/
    );
  });

  it("FeedbackReply.adminId FK references User(id) ON DELETE CASCADE", () => {
    expect(sql).toMatch(
      /ALTER TABLE "FeedbackReply" ADD CONSTRAINT "FeedbackReply_adminId_fkey" FOREIGN KEY \("adminId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/
    );
  });
});
