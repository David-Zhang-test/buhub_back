import { z } from "zod";

export const REPORT_CATEGORIES = [
  "spam",
  "hate_speech",
  "violence",
  "harassment",
  "inappropriate",
  "other",
] as const;

export const createReportSchema = z.object({
  targetType: z.enum(["post", "comment", "function"]),
  targetId: z.string().min(1),
  reasonCategory: z.enum(REPORT_CATEGORIES),
  reason: z.string().max(500).optional(),
});
