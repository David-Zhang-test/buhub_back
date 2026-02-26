import { z } from "zod";

export const errandCategorySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toUpperCase() : value),
  z.enum(["PICKUP", "BUY", "OTHER"])
);

export const createErrandSchema = z.object({
  category: errandCategorySchema,
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  price: z.string().min(1).max(50),
  item: z.string().min(1).max(200),
  time: z.string().min(1).max(100),
  expiresAt: z.string().datetime(),
});
