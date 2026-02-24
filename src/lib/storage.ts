/**
 * OSS / S3 storage utilities for presigned URLs.
 * Implement with AWS S3, Alibaba OSS, or compatible service.
 */

export interface PresignedUrlOptions {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId: string;
  host?: string; // Optional: pass the request host for generating correct URLs
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateUpload(opts: PresignedUrlOptions): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(opts.mimeType)) {
    return { valid: false, error: "Invalid file type. Allowed: jpg, png, gif, webp" };
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
  const fileKey = `uploads/${opts.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Use host from request if available, otherwise fallback to environment config
  const baseUrl = opts.host
    ? `http://${opts.host}`
    : (process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"));

  const uploadUrl = `${baseUrl.replace(/\/$/, "")}/api/upload/${fileKey}`;
  const fileUrl = `${baseUrl.replace(/\/$/, "")}/uploads/${fileKey}`;

  return {
    uploadUrl,
    fileKey,
    fileUrl,
  };
}
