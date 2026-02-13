import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const completeSchema = z.object({
  fileKey: z.string(),
  fileUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    await getCurrentUser(req);
    const body = await req.json();
    const data = completeSchema.parse(body);

    return NextResponse.json({
      success: true,
      data: {
        fileKey: data.fileKey,
        fileUrl: data.fileUrl,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
