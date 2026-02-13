import { z } from "zod";

export const updateProfileSchema = z.object({
  nickname: z.string().min(2).max(50).optional(),
  avatar: z.string().optional(),
  grade: z.string().optional(),
  major: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  bio: z.string().max(500).optional(),
});
