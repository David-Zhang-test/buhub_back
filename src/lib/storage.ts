/**
 * OSS / S3 storage utilities for presigned URLs.
 * When S3_UPLOADS_BUCKET is set, uploads go to S3. Client URLs use NEXT_PUBLIC_APP_URL/api/uploads/... unless ASSET_PUBLIC_BASE_URL is set.
 */

import {
  getPresignedPutUrl,
  isS3UploadsEnabled,
  resolvePublicFileUrl,
} from "@/src/lib/s3";

export interface PresignedUrlOptions {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId: string;
  host?: string; // Optional: pass the request host for generating correct URLs
  protocol?: string; // Optional: pass request protocol (http/https)
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/x-caf",
  "audio/wav",
  "audio/aac",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateUpload(opts: PresignedUrlOptions): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(opts.mimeType)) {
    return {
      valid: false,
      error: "Invalid file type. Allowed: jpg, png, gif, webp, m4a, mp4, caf, wav, aac",
    };
  }
  if (opts.fileSize > MAX_SIZE) {
    return { valid: false, error: "File size exceeds 10MB limit" };
  }
  return { valid: true };
}

/**
 * Generate presigned URL for upload.
 * Stub implementation - replace with actual OSS/S3 SDK.
 */
export async function getPresignedUploadUrl(
  opts: PresignedUrlOptions
): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string }> {
  const ext = opts.fileName.split(".").pop() || "jpg";
  // Keep fileKey relative to "public/uploads" to avoid nested "uploads/uploads".
  const fileKey = `${opts.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  if (isS3UploadsEnabled()) {
    const uploadUrl = await getPresignedPutUrl(fileKey, opts.mimeType);
    const fileUrl = resolvePublicFileUrl(fileKey);
    return { uploadUrl, fileKey, fileUrl };
  }

  // Prefer configured public URL for stability across client network changes.
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  // Force HTTPS in production, use HTTPS if configured, otherwise use request protocol
  const isProduction = process.env.NODE_ENV === "production";
  const protocol = isProduction
    ? "https"
    : (opts.protocol === "https" ? "https" : (opts.protocol || "http").replace(/:$/, ""));
  const requestBaseUrl = opts.host ? `${protocol}://${opts.host}` : "";
  const baseUrl = (configuredBaseUrl || requestBaseUrl || "").replace(/\/$/, "");

  const uploadUrl = `${baseUrl}/api/upload/${fileKey}`;
  // Serve user-scoped uploads via API route (stable in standalone runtime).
  const fileUrl = `/api/uploads/${fileKey}`;

  return {
    uploadUrl,
    fileKey,
    fileUrl,
  };
}
