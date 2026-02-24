import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { getPresignedUploadUrl, validateUpload } from "@/src/lib/storage";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const presignedSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().positive().max(10 * 1024 * 1024),
  mimeType: z.string().refine(
    (t) => ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(t),
    { message: "Invalid file type" }
  ),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = presignedSchema.parse(body);

    const validation = validateUpload({
      ...data,
      userId: user.id,
    });
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: validation.error } },
        { status: 400 }
      );
    }

    // Get the host from request headers to generate correct URLs for mobile clients
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;

    const result = await getPresignedUploadUrl({
      ...data,
      userId: user.id,
      host,
    });

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        fileKey: result.fileKey,
        fileUrl: result.fileUrl,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
