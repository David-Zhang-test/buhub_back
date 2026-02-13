import { z } from "zod";

export const sendCodeSchema = z.object({
  email: z.string().email(),
});

export const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export const profileSetupSchema = z.object({
  nickname: z.string().min(2).max(50),
  grade: z.string(),
  major: z.string(),
  gender: z.enum(["male", "female", "other"]),
  bio: z.string().max(500).optional(),
  language: z.enum(["en", "zh-CN", "zh-TW"]).optional(),
});
