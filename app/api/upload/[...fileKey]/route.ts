import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function isSafeFileKey(fileKey: string, userId: string): boolean {
  if (!fileKey.startsWith(`uploads/${userId}/`)) return false;
  if (fileKey.includes("..")) return false;
  const resolved = path.resolve(UPLOAD_DIR, fileKey);
  return resolved.startsWith(path.resolve(UPLOAD_DIR));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ fileKey: string[] }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { fileKey: segments } = await params;
    const fileKey = segments.join("/");

    if (!isSafeFileKey(fileKey, user.id)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid upload path" } },
        { status: 403 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fullPath = path.resolve(UPLOAD_DIR, fileKey);
    if (!fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid upload path" } },
        { status: 403 }
      );
    }

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_FAILED", message: "Upload failed" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ fileKey: string[] }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { fileKey: segments } = await params;
    const fileKey = segments.join("/");

    if (!isSafeFileKey(fileKey, user.id)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot delete this file" } },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
