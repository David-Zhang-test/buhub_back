import { z } from "zod";

export const secondhandCategorySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toUpperCase() : value),
  z.enum(["ELECTRONICS", "BOOKS", "FURNITURE", "OTHER"])
);

export const createSecondhandSchema = z.object({
  category: secondhandCategorySchema,
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  price: z.string().min(1).max(50),
  condition: z.string().min(1).max(50),
  location: z.string().min(1).max(200),
  images: z.array(z.string().url()).max(9).optional().default([]),
  expiresAt: z.string().datetime(),
});
