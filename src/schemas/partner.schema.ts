import { z } from "zod";

export const partnerCategorySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toUpperCase() : value),
  z.enum(["TRAVEL", "FOOD", "COURSE", "SPORTS", "OTHER"])
);

export const createPartnerSchema = z.object({
  category: partnerCategorySchema,
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  time: z.string().min(1).max(100),
  location: z.string().max(200).default(""),
  expiresAt: z.string().datetime(),
});
