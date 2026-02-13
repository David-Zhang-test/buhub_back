import { z } from "zod";

export const partnerCategorySchema = z.enum(["TRAVEL", "FOOD", "COURSE", "SPORTS", "OTHER"]);

export const createPartnerSchema = z.object({
  category: partnerCategorySchema,
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  time: z.string().min(1).max(100),
  location: z.string().min(1).max(200),
  expiresAt: z.string().datetime(),
});
