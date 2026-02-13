import { z } from "zod";

export const createReportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
