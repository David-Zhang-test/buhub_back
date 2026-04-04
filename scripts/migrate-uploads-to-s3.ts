/**
 * Upload files under public/uploads (or UPLOADS_SOURCE_DIR) to S3, then rewrite DB URLs.
 *
 * Required env: S3_UPLOADS_BUCKET, NEXT_PUBLIC_APP_URL (API base, for private bucket URLs), AWS_REGION (or default),
 * plus AWS credentials (env, profile, or IAM role). Optional: ASSET_PUBLIC_BASE_URL if you serve files from CDN/public URL directly.
 *
 * Usage (from buhub_back):
 *   npx tsx scripts/migrate-uploads-to-s3.ts --dry-run
 *   npx tsx scripts/migrate-uploads-to-s3.ts --upload-only
 *   npx tsx scripts/migrate-uploads-to-s3.ts --db-only
 *   npx tsx scripts/migrate-uploads-to-s3.ts
 *
 * Optional: UPLOADS_SOURCE_DIR=/absolute/path/to/uploads
 *
 * Objects are written with the same logical layout as the repo: `public/uploads/<relative path>`
 * under the bucket (or `S3_UPLOADS_KEY_PREFIX/<relative>` when that env is set), matching
 * `s3ReadKeyCandidates` / on-disk `public/uploads` tree — not bare keys at the bucket root.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import {
  getS3Bucket,
  getS3Client,
  isS3UploadsEnabled,
  resolvePublicFileUrl,
} from "../src/lib/s3";

const prisma = new PrismaClient();

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".caf": "audio/x-caf",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".zip": "application/zip",
  ".json": "application/json",
};

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    uploadOnly: argv.includes("--upload-only"),
    dbOnly: argv.includes("--db-only"),
  };
}

function getAppOrigin(): string | null {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

function extractUploadKeyFromRef(ref: string, appOrigin: string | null): string | null {
  const r = ref.trim();
  const stripToKey = (pathname: string): string | null => {
    if (pathname.startsWith("/uploads/")) return pathname.slice("/uploads/".length);
    if (pathname.startsWith("/api/uploads/")) return pathname.slice("/api/uploads/".length);
    return null;
  };

  if (r.startsWith("/uploads/") || r.startsWith("/api/uploads/")) {
    return stripToKey(r);
  }
  if (r.startsWith("uploads/")) return r.slice("uploads/".length);
  if (r.startsWith("api/uploads/")) return r.slice("api/uploads/".length);

  try {
    const u = new URL(r);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (appOrigin && u.origin !== appOrigin) return null;
    return stripToKey(u.pathname);
  } catch {
    return null;
  }
}

/** Map /uploads/... or /api/uploads/... (or same-origin absolute URL) → resolvePublicFileUrl(key). */
function rewriteUploadRef(ref: string, appOrigin: string | null): string | null {
  const r = ref.trim();
  if (!r) return null;
  const key = extractUploadKeyFromRef(r, appOrigin);
  if (!key) return null;
  let newUrl: string;
  try {
    newUrl = resolvePublicFileUrl(key);
  } catch {
    return null;
  }
  if (newUrl === r) return null;
  return newUrl;
}

function walkFiles(rootDir: string): string[] {
  const out: string[] = [];
  if (!existsSync(rootDir)) return out;

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
    }
  };
  walk(rootDir);
  return out;
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

/** S3 object key mirroring `public/uploads/<rel>` (same as `toS3WriteKey` when prefix is unset: default `public/uploads`). */
function migrationObjectKey(rel: string): string {
  const p = (process.env.S3_UPLOADS_KEY_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
  const base = p || "public/uploads";
  const k = rel.replace(/^\/+/, "");
  return `${base}/${k}`;
}

async function putUploadObjectExactKey(
  objectKey: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    })
  );
}

async function uploadTree(localRoot: string, dryRun: boolean) {
  const files = walkFiles(localRoot);
  let uploaded = 0;

  for (const abs of files) {
    let rel = path.relative(localRoot, abs).split(path.sep).join("/");
    // Some deployments accidentally nested `public/uploads/uploads/...`; normalize to match DB keys.
    if (rel.startsWith("uploads/")) {
      rel = rel.slice("uploads/".length);
    }
    const s3Key = migrationObjectKey(rel);
    const buffer = readFileSync(abs);
    const ct = contentTypeFor(abs);
    if (dryRun) {
      console.log(`[dry-run] would upload s3://${process.env.S3_UPLOADS_BUCKET}/${s3Key} (${buffer.length} bytes, ${ct})`);
      uploaded++;
      continue;
    }
    await putUploadObjectExactKey(s3Key, buffer, ct);
    uploaded++;
    if (uploaded % 200 === 0) console.log(`  uploaded ${uploaded} files...`);
  }
  console.log(`Upload: ${uploaded} files${dryRun ? " (dry-run)" : ""}`);
}

async function migrateDatabase(dryRun: boolean) {
  const appOrigin = getAppOrigin();
  let updates = 0;

  const bump = () => {
    updates++;
  };

  const patchString = (s: string | null | undefined): string | null => {
    if (s == null || s === "") return null;
    const n = rewriteUploadRef(s, appOrigin);
    return n ?? null;
  };

  const patchArr = (arr: string[]): string[] | null => {
    let changed = false;
    const next = arr.map((x) => {
      const n = patchString(x);
      if (n) {
        changed = true;
        return n;
      }
      return x;
    });
    return changed ? next : null;
  };

  // User.avatar
  const users = await prisma.user.findMany({ select: { id: true, avatar: true } });
  for (const u of users) {
    const n = patchString(u.avatar);
    if (n) {
      if (!dryRun) await prisma.user.update({ where: { id: u.id }, data: { avatar: n } });
      bump();
      console.log(`User ${u.id} avatar`);
    }
  }

  // Post
  const posts = await prisma.post.findMany({ select: { id: true, images: true, anonymousAvatar: true } });
  for (const p of posts) {
    const img = patchArr(p.images);
    const anon = patchString(p.anonymousAvatar ?? undefined);
    if (img || anon) {
      if (!dryRun) {
        const data: { images?: string[]; anonymousAvatar?: string } = {};
        if (img) data.images = img;
        if (anon) data.anonymousAvatar = anon;
        await prisma.post.update({ where: { id: p.id }, data });
      }
      bump();
    }
  }

  // DirectMessage.images
  const dms = await prisma.directMessage.findMany({ select: { id: true, images: true } });
  for (const m of dms) {
    const img = patchArr(m.images);
    if (img) {
      if (!dryRun) await prisma.directMessage.update({ where: { id: m.id }, data: { images: img } });
      bump();
    }
  }

  // SecondhandItem.images
  const sh = await prisma.secondhandItem.findMany({ select: { id: true, images: true } });
  for (const s of sh) {
    const img = patchArr(s.images);
    if (img) {
      if (!dryRun) await prisma.secondhandItem.update({ where: { id: s.id }, data: { images: img } });
      bump();
    }
  }

  // RatingItem.avatar
  const items = await prisma.ratingItem.findMany({ select: { id: true, avatar: true } });
  for (const it of items) {
    const n = patchString(it.avatar ?? undefined);
    if (n) {
      if (!dryRun) await prisma.ratingItem.update({ where: { id: it.id }, data: { avatar: n } });
      bump();
    }
  }

  // Schedule.imageUrl
  const schedules = await prisma.schedule.findMany({ select: { id: true, imageUrl: true } });
  for (const s of schedules) {
    const n = patchString(s.imageUrl ?? undefined);
    if (n) {
      if (!dryRun) await prisma.schedule.update({ where: { id: s.id }, data: { imageUrl: n } });
      bump();
    }
  }

  // Feedback.imageUrls
  const fbs = await prisma.feedback.findMany({ select: { id: true, imageUrls: true } });
  for (const f of fbs) {
    const img = patchArr(f.imageUrls);
    if (img) {
      if (!dryRun) await prisma.feedback.update({ where: { id: f.id }, data: { imageUrls: img } });
      bump();
    }
  }

  console.log(`Database: ${updates} row updates${dryRun ? " (dry-run)" : ""}`);
}

async function main() {
  const { dryRun, uploadOnly, dbOnly } = parseArgs();

  if (!isS3UploadsEnabled()) {
    throw new Error("Set S3_UPLOADS_BUCKET before running this script.");
  }

  try {
    console.log("Sample public file URL:", resolvePublicFileUrl("avatars/example.jpg"));
  } catch (e) {
    throw new Error(
      `Cannot build public file URLs: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const sourceDir = process.env.UPLOADS_SOURCE_DIR?.trim()
    ? path.resolve(process.env.UPLOADS_SOURCE_DIR)
    : path.resolve(process.cwd(), "public", "uploads");

  console.log("S3 bucket:", process.env.S3_UPLOADS_BUCKET);
  console.log("Source dir:", sourceDir);
  console.log("dryRun:", dryRun, "uploadOnly:", uploadOnly, "dbOnly:", dbOnly);

  if (!dbOnly) {
    await uploadTree(sourceDir, dryRun);
  }
  if (!uploadOnly) {
    await migrateDatabase(dryRun);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
