import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const settingsSchema = z.object({
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  followers: z.boolean().optional(),
  messages: z.boolean().optional(),
  system: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser(req);
    // TODO: Store per-user notification settings in DB
    return NextResponse.json({
      success: true,
      data: {
        likes: true,
        comments: true,
        followers: true,
        messages: true,
        system: true,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await getCurrentUser(req);
    const body = await req.json();
    settingsSchema.parse(body);
    // TODO: Persist per-user notification settings in DB
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
