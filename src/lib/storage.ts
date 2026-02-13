/**
 * OSS / S3 storage utilities for presigned URLs.
 * Implement with AWS S3, Alibaba OSS, or compatible service.
 */

export interface PresignedUrlOptions {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId: string;
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

  const baseUrl = process.env.OSS_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://api.buhub.app";
  const fileUrl = `${baseUrl}/uploads/${fileKey}`;

  return {
    uploadUrl: fileUrl,
    fileKey,
    fileUrl,
  };
}
