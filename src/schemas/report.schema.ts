import { z } from "zod";

export const createReportSchema = z.object({
  targetType: z.enum(["post", "comment", "function"]),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(500),
});
