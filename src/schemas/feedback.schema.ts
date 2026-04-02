import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["BUG", "SUGGESTION", "OTHER"] as const;

export const createFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  description: z.string().min(10).max(2000),
  imageUrls: z
    .array(z.string().min(1))
    .max(3)
    .optional()
    .default([]),
});

// Admin reply schema
export const adminReplySchema = z.object({
  content: z.string().min(1).max(2000),
});

// Admin status update schema
export const updateFeedbackStatusSchema = z.object({
  status: z.enum(["PENDING", "REPLIED", "RESOLVED"]),
});
