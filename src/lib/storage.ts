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
  protocol?: string; // Optional: pass request protocol (http/https)
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/m4a",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/webm",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateUpload(opts: PresignedUrlOptions): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(opts.mimeType)) {
    return {
      valid: false,
      error: "Invalid file type. Allowed: jpg, png, gif, webp, m4a, aac, mp4, mp3, webm",
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
  const fileKey = `uploads/${opts.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Prefer configured public URL for stability across client network changes.
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  // Force HTTPS in production, use HTTPS if configured, otherwise use request protocol
  const isProduction = process.env.NODE_ENV === "production";
  const protocol = isProduction
    ? "https"
    : (opts.protocol === "https" ? "https" : (opts.protocol || "http").replace(/:$/, ""));
  const requestBaseUrl = opts.host ? `${protocol}://${opts.host}` : "";
  const baseUrl = (configuredBaseUrl || requestBaseUrl || "https://localhost:3000").replace(/\/$/, "");

  const uploadUrl = `${baseUrl}/api/upload/${fileKey}`;
  // Store a relative URL so saved media never binds to the uploader's current IP/host.
  const fileUrl = `/uploads/${fileKey}`;

  return {
    uploadUrl,
    fileKey,
    fileUrl,
  };
}
