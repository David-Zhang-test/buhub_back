import { describe, it, expect } from "vitest";
import {
  createFeedbackSchema,
  FEEDBACK_CATEGORIES,
} from "@/src/schemas/feedback.schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    category: "BUG",
    description: "This is a valid description with enough chars",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SUBMIT-01: category validated as Zod enum (BUG | SUGGESTION | OTHER)
// ---------------------------------------------------------------------------

describe("SUBMIT-01 -- category field validated as Zod enum", () => {
  it("accepts each valid category value", () => {
    for (const cat of FEEDBACK_CATEGORIES) {
      const result = createFeedbackSchema.safeParse(
        validPayload({ category: cat })
      );
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid category value", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ category: "FEATURE_REQUEST" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("category");
    }
  });

  it("rejects a missing category field", () => {
    const { category: _, ...rest } = validPayload();
    const result = createFeedbackSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a numeric category", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ category: 1 })
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SUBMIT-02: description validated z.string().min(10).max(2000)
// ---------------------------------------------------------------------------

describe("SUBMIT-02 -- description field min(10) / max(2000) validation", () => {
  it("rejects description shorter than 10 characters", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ description: "too short" }) // 9 chars
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("description");
    }
  });

  it("accepts description with exactly 10 characters", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ description: "a".repeat(10) })
    );
    expect(result.success).toBe(true);
  });

  it("accepts description with exactly 2000 characters", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ description: "b".repeat(2000) })
    );
    expect(result.success).toBe(true);
  });

  it("rejects description longer than 2000 characters", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ description: "c".repeat(2001) })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("description");
    }
  });

  it("rejects a non-string description", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ description: 12345 })
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SUBMIT-03: imageUrls validated z.array(z.string().url()).max(3).optional().default([])
// ---------------------------------------------------------------------------

describe("SUBMIT-03 -- imageUrls validation (0-3 valid URLs, optional, defaults to [])", () => {
  it("defaults to empty array when imageUrls is omitted", () => {
    const result = createFeedbackSchema.parse(validPayload());
    expect(result.imageUrls).toEqual([]);
  });

  it("accepts 0 URLs (explicit empty array)", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ imageUrls: [] })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imageUrls).toEqual([]);
    }
  });

  it("accepts 1 valid URL", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ imageUrls: ["https://example.com/img1.png"] })
    );
    expect(result.success).toBe(true);
  });

  it("accepts 3 valid URLs (max boundary)", () => {
    const urls = [
      "https://example.com/a.png",
      "https://example.com/b.png",
      "https://example.com/c.png",
    ];
    const result = createFeedbackSchema.safeParse(
      validPayload({ imageUrls: urls })
    );
    expect(result.success).toBe(true);
  });

  it("rejects more than 3 URLs", () => {
    const urls = [
      "https://example.com/a.png",
      "https://example.com/b.png",
      "https://example.com/c.png",
      "https://example.com/d.png",
    ];
    const result = createFeedbackSchema.safeParse(
      validPayload({ imageUrls: urls })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("imageUrls");
    }
  });

  it("rejects non-URL strings in the array", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ imageUrls: ["not-a-url"] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects non-array values for imageUrls", () => {
    const result = createFeedbackSchema.safeParse(
      validPayload({ imageUrls: "https://example.com/img.png" })
    );
    expect(result.success).toBe(false);
  });
});
