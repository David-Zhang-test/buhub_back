import { z } from "zod";

export const ratingCategorySchema = z.enum(["COURSE", "TEACHER", "CANTEEN", "MAJOR"]);

export const submitRatingSchema = z.object({
  scores: z.record(z.string(), z.number().min(0).max(5)),
  tags: z.array(z.string()).max(10),
  comment: z.string().max(1000).optional(),
  semester: z.string().max(50).optional(),
});
