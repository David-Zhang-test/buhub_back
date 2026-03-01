import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function isSafeFileKey(fileKey: string, userId: string): boolean {
  if (!fileKey.startsWith(`${userId}/`)) return false;
  if (fileKey.includes("..")) return false;
  const resolved = path.resolve(UPLOAD_DIR, fileKey);
  return resolved.startsWith(path.resolve(UPLOAD_DIR));
}

function hasValidImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === "image/gif") {
    return (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    );
  }
  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
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

    const extension = path.extname(fileKey).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: "Only image uploads are allowed" } },
        { status: 400 }
      );
    }

    const contentType = (req.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: "Unsupported image content type" } },
        { status: 400 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length <= 0 || buffer.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: "Image size exceeds 10MB limit" } },
        { status: 400 }
      );
    }
    if (!hasValidImageSignature(buffer, contentType)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: "Uploaded file is not a valid image" } },
        { status: 400 }
      );
    }

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
    return handleError(error);
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
