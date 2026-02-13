import { z } from "zod";

export const createPostSchema = z.object({
  postType: z.enum(["image-text", "text", "poll"]),
  content: z.string().min(1).max(5000),
  images: z.array(z.string().url()).max(9).optional().default([]),
  tags: z.array(z.string().min(1).max(20)).max(5).optional().default([]),
  category: z.enum(["forum", "find-partner", "run-errands", "marketplace", "ratings"]).optional(),
  isAnonymous: z.boolean().optional().default(false),

  pollOptions: z.array(z.string().min(1).max(100)).min(2).max(10).optional(),
  pollEndDate: z.string().datetime().optional(),

  partnerType: z.string().optional(),
  eventEndDate: z.string().datetime().optional(),

  price: z.number().optional(),
  errandType: z.string().optional(),
  startAddress: z.string().optional(),
  endAddress: z.string().optional(),
  taskEndTime: z.string().datetime().optional(),

  itemPrice: z.number().optional(),
  itemLocation: z.string().optional(),
  saleEndTime: z.string().datetime().optional(),
});

export const updatePostSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  images: z.array(z.string().url()).max(9).optional(),
  tags: z.array(z.string().min(1).max(20)).max(5).optional(),
});

