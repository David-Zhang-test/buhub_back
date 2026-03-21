import { z } from "zod";

const translationEntitySchema = z.object({
  entityType: z.enum(["post", "comment", "partner", "errand", "secondhand", "rating"]),
  entityId: z.string().uuid(),
});

export const resolveTranslationSchema = translationEntitySchema.extend({
  targetLanguage: z.enum(["tc", "sc", "en"]),
});

export const resolveTranslationsBatchSchema = z.object({
  items: z.array(translationEntitySchema).min(1).max(100),
  targetLanguage: z.enum(["tc", "sc", "en"]),
});
