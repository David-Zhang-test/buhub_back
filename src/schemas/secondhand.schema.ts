import { z } from "zod";

const pricePattern = /^HK\$\s?[0-9][0-9,]*(\.[0-9]{1,2})?$/;

export const secondhandCategorySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toUpperCase() : value),
  z.enum(["ELECTRONICS", "BOOKS", "FURNITURE", "OTHER"])
);

const uploadImageSchema = z.string().refine(
  (value) => {
    if (!value) return false;
    if (value.startsWith("/uploads/")) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid image URL" }
);

export const createSecondhandSchema = z.object({
  category: secondhandCategorySchema,
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  price: z.string().min(1).max(50).regex(pricePattern, "Invalid price format"),
  condition: z.string().min(1).max(50),
  location: z.string().max(200).default(""),
  images: z.array(uploadImageSchema).max(9).optional().default([]),
  expiresAt: z.string().datetime(),
});
