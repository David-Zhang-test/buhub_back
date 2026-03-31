import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["BUG", "SUGGESTION", "OTHER"] as const;

export const createFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  description: z.string().min(10).max(2000),
  imageUrls: z
    .array(z.string().url())
    .max(3)
    .optional()
    .default([]),
});
