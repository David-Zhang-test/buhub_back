import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { existsSync } from "fs";
import path from "path";
import { z } from "zod";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const completeSchema = z.object({
  fileKey: z.string().min(1).max(500),
  fileUrl: z.string().url(),
});

function isOwnedFileKey(fileKey: string, userId: string): boolean {
  if (!fileKey.startsWith(`uploads/${userId}/`)) return false;
  if (fileKey.includes("..")) return false;
  const resolved = path.resolve(UPLOAD_DIR, fileKey);
  return resolved.startsWith(path.resolve(UPLOAD_DIR));
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = completeSchema.parse(body);

    if (!isOwnedFileKey(data.fileKey, user.id)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid file key" } },
        { status: 403 }
      );
    }

    const fullPath = path.resolve(UPLOAD_DIR, data.fileKey);
    if (!existsSync(fullPath) || !fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "File not found" } },
        { status: 404 }
      );
    }

    const fileUrl = data.fileUrl.startsWith("/") ? data.fileUrl : `/${data.fileKey}`;
    return NextResponse.json({
      success: true,
      data: {
        fileKey: data.fileKey,
        fileUrl,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
