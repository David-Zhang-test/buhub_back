import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const datamodel = Prisma.dmmf.datamodel;

function getModel(name: string) {
  const model = datamodel.models.find((m) => m.name === name);
  if (!model) throw new Error(`Model "${name}" not found in DMMF`);
  return model;
}

function getEnum(name: string) {
  const enumDef = datamodel.enums.find((e) => e.name === name);
  if (!enumDef) throw new Error(`Enum "${name}" not found in DMMF`);
  return enumDef;
}

function getField(modelName: string, fieldName: string) {
  const model = getModel(modelName);
  const field = model.fields.find((f) => f.name === fieldName);
  if (!field)
    throw new Error(`Field "${fieldName}" not found on model "${modelName}"`);
  return field;
}

// ---------------------------------------------------------------------------
// DATA-01: Feedback table has correct columns and relationships
// ---------------------------------------------------------------------------

describe("DATA-01 — Feedback and FeedbackReply schema structure", () => {
  // ── Enums ──────────────────────────────────────────────────────────────────

  it("FeedbackCategory enum has exactly BUG, SUGGESTION, OTHER", () => {
    const values = getEnum("FeedbackCategory").values.map((v) => v.name);
    expect(values).toEqual(["BUG", "SUGGESTION", "OTHER"]);
  });

  it("FeedbackStatus enum has exactly PENDING, REPLIED, RESOLVED", () => {
    const values = getEnum("FeedbackStatus").values.map((v) => v.name);
    expect(values).toEqual(["PENDING", "REPLIED", "RESOLVED"]);
  });

  // ── Feedback model columns ─────────────────────────────────────────────────

  it("Feedback model has all required scalar columns", () => {
    const model = getModel("Feedback");
    const scalarFields = model.fields
      .filter((f) => f.kind === "scalar" || f.kind === "enum")
      .map((f) => f.name);

    expect(scalarFields).toContain("id");
    expect(scalarFields).toContain("userId");
    expect(scalarFields).toContain("category");
    expect(scalarFields).toContain("description");
    expect(scalarFields).toContain("imageUrls");
    expect(scalarFields).toContain("status");
    expect(scalarFields).toContain("createdAt");
    expect(scalarFields).toContain("updatedAt");
  });

  it("Feedback.category uses FeedbackCategory enum", () => {
    const field = getField("Feedback", "category");
    expect(field.kind).toBe("enum");
    expect(field.type).toBe("FeedbackCategory");
  });

  it("Feedback.status uses FeedbackStatus enum with PENDING default", () => {
    const field = getField("Feedback", "status");
    expect(field.kind).toBe("enum");
    expect(field.type).toBe("FeedbackStatus");
    expect(field.hasDefaultValue).toBe(true);
    expect(field.default).toBe("PENDING");
  });

  it("Feedback.imageUrls is a String array", () => {
    const field = getField("Feedback", "imageUrls");
    expect(field.type).toBe("String");
    expect(field.isList).toBe(true);
  });

  it("Feedback.createdAt defaults to now()", () => {
    const field = getField("Feedback", "createdAt");
    expect(field.type).toBe("DateTime");
    expect(field.hasDefaultValue).toBe(true);
  });

  it("Feedback.updatedAt is a DateTime managed by Prisma", () => {
    const field = getField("Feedback", "updatedAt");
    expect(field.type).toBe("DateTime");
    expect(field.isRequired).toBe(true);
  });

  // ── FeedbackReply model columns ────────────────────────────────────────────

  it("FeedbackReply model has all required columns", () => {
    const model = getModel("FeedbackReply");
    const scalarFields = model.fields
      .filter((f) => f.kind === "scalar")
      .map((f) => f.name);

    expect(scalarFields).toContain("id");
    expect(scalarFields).toContain("feedbackId");
    expect(scalarFields).toContain("adminId");
    expect(scalarFields).toContain("content");
    expect(scalarFields).toContain("createdAt");
  });

  it("FeedbackReply does not have an updatedAt column (replies are immutable)", () => {
    const model = getModel("FeedbackReply");
    const fieldNames = model.fields.map((f) => f.name);
    expect(fieldNames).not.toContain("updatedAt");
  });

  // ── Cascade deletes ────────────────────────────────────────────────────────

  it("User -> Feedback cascades on delete", () => {
    const field = getField("Feedback", "user");
    expect(field.relationOnDelete).toBe("Cascade");
    expect(field.relationFromFields).toEqual(["userId"]);
    expect(field.relationToFields).toEqual(["id"]);
  });

  it("Feedback -> FeedbackReply cascades on delete", () => {
    const field = getField("FeedbackReply", "feedback");
    expect(field.relationOnDelete).toBe("Cascade");
    expect(field.relationFromFields).toEqual(["feedbackId"]);
    expect(field.relationToFields).toEqual(["id"]);
  });

  it("FeedbackReply.admin references User via adminId", () => {
    const field = getField("FeedbackReply", "admin");
    expect(field.type).toBe("User");
    expect(field.relationFromFields).toEqual(["adminId"]);
    expect(field.relationToFields).toEqual(["id"]);
    expect(field.relationName).toBe("FeedbackReplyAdmin");
  });

  // ── User model relation arrays ─────────────────────────────────────────────

  it("User model has feedbacks relation array", () => {
    const field = getField("User", "feedbacks");
    expect(field.type).toBe("Feedback");
    expect(field.isList).toBe(true);
  });

  it("User model has feedbackReplies relation array with named relation", () => {
    const field = getField("User", "feedbackReplies");
    expect(field.type).toBe("FeedbackReply");
    expect(field.isList).toBe(true);
    expect(field.relationName).toBe("FeedbackReplyAdmin");
  });
});
