import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { validateFileMagicBytes } from "@/src/lib/file-validate";
import { moderateImageBuffer } from "@/src/lib/content-moderation";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { deleteS3Object, isS3UploadsEnabled, uploadBufferToS3 } from "@/src/lib/s3";
import { child } from "@/src/lib/logger";

const log = child("upload/file");

// Run image moderation off the response path. If the buffer is flagged, delete
// the just-stored object so a violating image can't survive past the check.
// Mirrors the fire-and-forget pattern in app/api/messages/route.ts.
function moderateImageAsync(
  fileKey: string,
  buffer: Buffer,
  contentType: string,
  fullPath: string
) {
  void moderateImageBuffer(buffer, contentType)
    .then(async (moderation) => {
      if (!moderation.flagged) return;
      log.warn("flagged image, removing", { fileKey, categories: moderation.categories });
      try {
        if (isS3UploadsEnabled()) {
          await deleteS3Object(fileKey);
        } else {
          await unlink(fullPath).catch(() => undefined);
        }
      } catch (err) {
        log.error("failed to remove flagged image", { fileKey, err });
      }
    })
    .catch((err) => {
      // Fail-open: keep the file if moderation itself errors out, matching the
      // direct-message image flow which also doesn't block on moderation faults.
      log.error("image moderation crashed", { fileKey, err });
    });
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/x-caf",
  "audio/wav",
  "audio/aac",
  "audio/amr-wb",
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const ALLOWED_AUDIO_EXTENSIONS = new Set([".m4a", ".mp4", ".caf", ".wav", ".aac", ".awb"]);

function isSafeFileKey(fileKey: string, userId: string): boolean {
  if (!fileKey.startsWith(`${userId}/`)) return false;
  if (fileKey.includes("..")) return false;
  const resolved = path.resolve(UPLOAD_DIR, fileKey);
  return resolved.startsWith(path.resolve(UPLOAD_DIR));
}

function getUploadKind(extension: string, contentType: string): "image" | "audio" | null {
  if (ALLOWED_IMAGE_EXTENSIONS.has(extension) && ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
    return "image";
  }
  if (ALLOWED_AUDIO_EXTENSIONS.has(extension) && ALLOWED_AUDIO_MIME_TYPES.has(contentType)) {
    return "audio";
  }
  return null;
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

    const contentType = (req.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
    const extension = path.extname(fileKey).toLowerCase();
    const uploadKind = getUploadKind(extension, contentType);
    if (!uploadKind) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: "Unsupported upload file type" } },
        { status: 400 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length <= 0 || buffer.length > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_UPLOAD", message: "File size exceeds 10MB limit" } },
        { status: 400 }
      );
    }
    if (!validateFileMagicBytes(buffer, contentType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_UPLOAD",
            message: uploadKind === "audio"
              ? "Uploaded file is not a valid audio file"
              : "Uploaded file is not a valid image",
          },
        },
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

    if (isS3UploadsEnabled()) {
      await uploadBufferToS3(fileKey, buffer, contentType);
    } else {
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, buffer);
    }

    // Image moderation runs after the file is stored so the response isn't
    // blocked on an external API call. If flagged, the file is deleted by the
    // background task before any client can fetch it for long.
    if (uploadKind === "image") {
      moderateImageAsync(fileKey, buffer, contentType, fullPath);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    log.error("upload error", { error });
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

    const fullPath = path.resolve(UPLOAD_DIR, fileKey);
    try {
      if (isS3UploadsEnabled()) {
        await deleteS3Object(fileKey);
      } else if (fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
        await unlink(fullPath).catch(() => undefined);
      }
    } catch {
      // best-effort delete
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
