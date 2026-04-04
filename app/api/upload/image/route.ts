import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { validateImageMagicBytes } from "@/src/lib/file-validate";
import { moderateImageBuffer } from "@/src/lib/content-moderation";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { isS3UploadsEnabled, resolvePublicFileUrl, uploadBufferToS3 } from "@/src/lib/s3";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const formData = await req.formData();

    // Support single file (field: "image") or multiple files (field: "images")
    const singleFile = formData.get("image") as File | null;
    const allFiles = formData.getAll("images") as File[];
    const files = singleFile ? [singleFile] : allFiles;

    if (files.length === 0 || !(files[0] instanceof File)) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "No image file provided" } },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const maxSize = 10 * 1024 * 1024; // 10MB
    const uploadDir = path.join(process.cwd(), "public", "uploads", "images");
    const useS3 = isS3UploadsEnabled();
    if (!useS3) {
      await mkdir(uploadDir, { recursive: true });
    }

    const urls: string[] = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_TYPE", message: `Invalid file type: ${file.type}` } },
          { status: 400 }
        );
      }
      if (file.size > maxSize) {
        return NextResponse.json(
          { success: false, error: { code: "TOO_LARGE", message: "File exceeds 10MB limit" } },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (!validateImageMagicBytes(buffer, file.type)) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_TYPE", message: "File content does not match declared type" } },
          { status: 400 }
        );
      }

      const moderation = await moderateImageBuffer(buffer, file.type);
      if (moderation.flagged) {
        return NextResponse.json(
          { success: false, error: { code: "CONTENT_VIOLATION", message: "Image contains content that violates community guidelines", categories: moderation.categories } },
          { status: 400 }
        );
      }

      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const objectKey = `images/${fileName}`;
      if (useS3) {
        await uploadBufferToS3(objectKey, buffer, file.type);
        urls.push(resolvePublicFileUrl(objectKey));
      } else {
        await writeFile(path.join(uploadDir, fileName), buffer);
        urls.push(`/uploads/images/${fileName}`);
      }
    }

    // Return single url for single file, urls array for multiple
    if (singleFile) {
      return NextResponse.json({ success: true, data: { url: urls[0] } });
    }
    return NextResponse.json({ success: true, data: { urls } });
  } catch (error) {
    return handleError(error);
  }
}
