import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { child } from "@/src/lib/logger";

const log = child("s3");

let client: S3Client | null = null;

/** Set `S3_UPLOADS_BUCKET` to store uploads in S3 (private bucket OK — reads go through `/api/uploads/...`). */
export function isS3UploadsEnabled(): boolean {
  return Boolean(process.env.S3_UPLOADS_BUCKET?.trim());
}

export function getS3Bucket(): string {
  const bucket = process.env.S3_UPLOADS_BUCKET?.trim();
  if (!bucket) {
    throw new Error("S3_UPLOADS_BUCKET is not configured");
  }
  return bucket;
}

export function getS3Client(): S3Client {
  if (!client) {
    const region =
      process.env.AWS_REGION?.trim() ||
      process.env.AWS_DEFAULT_REGION?.trim() ||
      "us-east-1";
    client = new S3Client({ region });
  }
  return client;
}

/**
 * Optional prefix for **new** writes (Put / presigned). No leading/trailing slashes.
 * Example: `public/uploads` if new objects should live at `public/uploads/userId/file.jpg`.
 */
function normalizedKeyPrefix(): string {
  return (process.env.S3_UPLOADS_KEY_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
}

/** Legacy: write objects at bucket root `userId/file.jpg` (reads still try `public/uploads/...` first). */
function s3BareRootWrites(): boolean {
  return process.env.S3_UPLOADS_BARE_ROOT === "1";
}

/**
 * Keys to try when reading (HEAD/GET). API path is `userId/file.jpg` (same as on-disk under public/uploads/).
 * Merges env prefix with common manual-upload layouts so one wrong prefix does not hide `public/uploads/...`.
 */
export function s3ReadKeyCandidates(apiRelativeKey: string): string[] {
  const k = apiRelativeKey.replace(/^\//, "");
  const p = normalizedKeyPrefix();
  const out: string[] = [];
  const push = (key: string) => {
    if (!out.includes(key)) out.push(key);
  };
  if (p) push(`${p}/${k}`);
  push(`public/uploads/${k}`);
  // Bad tar/sync: bucket had `public/uploads/public/uploads/...`
  push(`public/uploads/public/uploads/${k}`);
  push(`uploads/${k}`);
  push(k);
  return out;
}

/**
 * Single key for new uploads (Put / presigned PUT).
 * Default layout matches `public/uploads/` on disk and the migration script: `public/uploads/<apiKey>`.
 * Set `S3_UPLOADS_KEY_PREFIX` to override the base segment; set `S3_UPLOADS_BARE_ROOT=1` for legacy root keys only.
 */
export function toS3WriteKey(apiRelativeKey: string): string {
  const k = apiRelativeKey.replace(/^\//, "");
  const p = normalizedKeyPrefix();
  if (s3BareRootWrites()) {
    return p ? `${p}/${k}` : k;
  }
  const base = p || "public/uploads";
  return `${base}/${k}`;
}

function encodeKeyPathForUrl(objectKey: string): string {
  const key = objectKey.replace(/^\//, "");
  return key
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/**
 * URL stored in DB / returned to clients.
 * - If `ASSET_PUBLIC_BASE_URL` is set (e.g. CDN later): `base/key`.
 * - Else: `NEXT_PUBLIC_APP_URL/api/uploads/key` (your API serves private objects from S3).
 */
export function resolvePublicFileUrl(objectKey: string): string {
  const encodedPath = encodeKeyPathForUrl(objectKey);
  const direct = process.env.ASSET_PUBLIC_BASE_URL?.trim();
  if (direct) {
    return `${direct.replace(/\/$/, "")}/${encodedPath}`;
  }
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!app) {
    throw new Error(
      "With S3 uploads, set NEXT_PUBLIC_APP_URL to your API base (e.g. https://api.example.com), or set ASSET_PUBLIC_BASE_URL for direct/CDN URLs."
    );
  }
  const base = app.replace(/\/$/, "");
  return `${base}/api/uploads/${encodedPath}`;
}

/** @deprecated Use resolvePublicFileUrl */
export const buildPublicAssetUrl = resolvePublicFileUrl;

export async function uploadBufferToS3(
  objectKey: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const Key = toS3WriteKey(objectKey);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function s3ObjectExists(objectKey: string): Promise<boolean> {
  for (const Key of s3ReadKeyCandidates(objectKey)) {
    try {
      await getS3Client().send(
        new HeadObjectCommand({
          Bucket: getS3Bucket(),
          Key,
        })
      );
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function headS3UploadObject(
  objectKey: string
): Promise<{ contentLength: number; contentType: string } | null> {
  for (const Key of s3ReadKeyCandidates(objectKey)) {
    try {
      const out = await getS3Client().send(
        new HeadObjectCommand({
          Bucket: getS3Bucket(),
          Key,
        })
      );
      return {
        contentLength: Number(out.ContentLength ?? 0),
        contentType: out.ContentType || "application/octet-stream",
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function deleteS3Object(objectKey: string): Promise<void> {
  const bucket = getS3Bucket();
  const client = getS3Client();
  const keys = new Set<string>([
    toS3WriteKey(objectKey),
    ...s3ReadKeyCandidates(objectKey),
  ]);
  for (const Key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    } catch {
      /* best-effort per key */
    }
  }
}

export async function getPresignedPutUrl(
  objectKey: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  const Key = toS3WriteKey(objectKey);
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });
}

/** Full GET or ranged GET for proxying private S3 objects through the API. */
export async function fetchUploadObjectFromS3(
  objectKey: string,
  rangeHeader: string | null
): Promise<
  | {
      status: 200;
      body: Uint8Array;
      contentType: string;
      contentLength: number;
    }
  | {
      status: 206;
      body: Uint8Array;
      contentType: string;
      contentRange: string;
      totalSize: number;
    }
  | { status: 416; totalSize: number }
  | null
> {
  const bucket = getS3Bucket();
  const client = getS3Client();

  let Key: string | null = null;
  let totalSize = 0;
  let contentType = "application/octet-stream";
  const headFailures: string[] = [];

  for (const candidate of s3ReadKeyCandidates(objectKey)) {
    try {
      const headOut = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: candidate })
      );
      Key = candidate;
      totalSize = Number(headOut.ContentLength ?? 0);
      contentType = headOut.ContentType || "application/octet-stream";
      break;
    } catch (e: unknown) {
      const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
      const code = err.name || err.Code || "Error";
      const http = err.$metadata?.httpStatusCode ?? "";
      headFailures.push(`${candidate} → ${code}${http ? ` (${http})` : ""}`);
    }
  }

  if (!Key) {
    if (process.env.S3_DEBUG_UPLOADS === "1") {
      log.warn("HEAD miss for upload proxy", {
        apiKey: objectKey,
        bucket,
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
        tried: headFailures,
      });
    }
    return null;
  }

  try {
    if (!rangeHeader) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
      const body = await out.Body?.transformToByteArray();
      if (!body) return null;
      return { status: 200, body, contentType, contentLength: body.length };
    }

    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return { status: 416, totalSize };
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : totalSize - 1;

    if (
      Number.isNaN(start)
      || Number.isNaN(end)
      || start < 0
      || end < start
      || start >= totalSize
    ) {
      return { status: 416, totalSize };
    }

    const rangeSpec = `bytes=${start}-${end}`;
    const out = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key,
        Range: rangeSpec,
      })
    );
    const body = await out.Body?.transformToByteArray();
    if (!body) return null;
    const contentRange =
      out.ContentRange || `bytes ${start}-${start + body.length - 1}/${totalSize}`;
    return { status: 206, body, contentType, contentRange, totalSize };
  } catch {
    return null;
  }
}
