import { z } from "zod";

export const sendCodeSchema = z.object({
  email: z.string().email(),
  captchaToken: z.string().min(1, "Captcha verification required"),
});

export const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export const profileSetupSchema = z.object({
  autoGenerate: z.boolean().optional(),
  nickname: z.string().min(2).max(50).optional(),
  grade: z.string().optional(),
  major: z.string().optional(),
  gender: z.enum(["male", "female", "other", "secret"]).transform((v) => (v === "secret" ? "other" : v)).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().max(2048).optional(),
  language: z
    .enum(["en", "zh-CN", "zh-TW", "tc", "sc"])
    .optional()
    .transform((v) => (v === "tc" ? "zh-TW" : v === "sc" ? "zh-CN" : v)),
  userName: z.string().min(2).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
});
