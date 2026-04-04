/**
 * List unique upload keys referenced in the DB and check each against:
 *   - local `public/uploads/<key>`
 *   - S3 (any key in `s3ReadKeyCandidates`, same as the API proxy)
 *
 * Usage (from buhub_back, with `.env` loaded as usual):
 *   npm run s3:audit-upload-refs
 *   npm run s3:audit-upload-refs -- --print-missing
 *
 * Requires `DATABASE_URL`. S3 checks run only if `S3_UPLOADS_BUCKET` is set (+ AWS creds).
 */

import { PrismaClient } from "@prisma/client";
import { existsSync, statSync } from "fs";
import path from "path";
import { isS3UploadsEnabled, s3ObjectExists } from "../src/lib/s3";

const prisma = new PrismaClient();

/**
 * Api-relative key, e.g. `userId/123.jpg`. For absolute URLs, any host is accepted if the path
 * looks like `/api/uploads/...` or `/uploads/...` (so old production URLs still parse).
 */
function extractUploadKeyFromRef(ref: string): string | null {
  const r = ref.trim();
  if (!r) return null;
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
    return stripToKey(u.pathname);
  } catch {
    return null;
  }
}

function addRef(set: Set<string>, ref: string | null | undefined) {
  if (ref == null || ref === "") return;
  const k = extractUploadKeyFromRef(ref);
  if (k) set.add(k);
}

function localFileExists(uploadsRoot: string, key: string): boolean {
  const full = path.join(uploadsRoot, ...key.split("/").filter(Boolean));
  if (!existsSync(full)) return false;
  try {
    return statSync(full).isFile();
  } catch {
    return false;
  }
}

async function main() {
  const printMissing = process.argv.includes("--print-missing");
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const useS3 = isS3UploadsEnabled();

  const keys = new Set<string>();

  const users = await prisma.user.findMany({ select: { avatar: true } });
  for (const u of users) addRef(keys, u.avatar);

  const posts = await prisma.post.findMany({ select: { images: true, anonymousAvatar: true } });
  for (const p of posts) {
    for (const x of p.images) addRef(keys, x);
    addRef(keys, p.anonymousAvatar);
  }

  const dms = await prisma.directMessage.findMany({ select: { images: true } });
  for (const m of dms) for (const x of m.images) addRef(keys, x);

  const sh = await prisma.secondhandItem.findMany({ select: { images: true } });
  for (const s of sh) for (const x of s.images) addRef(keys, x);

  const items = await prisma.ratingItem.findMany({ select: { avatar: true } });
  for (const it of items) addRef(keys, it.avatar);

  const schedules = await prisma.schedule.findMany({ select: { imageUrl: true } });
  for (const s of schedules) addRef(keys, s.imageUrl);

  const fbs = await prisma.feedback.findMany({ select: { imageUrls: true } });
  for (const f of fbs) for (const x of f.imageUrls) addRef(keys, x);

  let missingLocal = 0;
  let missingS3 = 0;
  let okLocal = 0;
  let okS3 = 0;
  const missingLocalKeys: string[] = [];
  const missingS3Keys: string[] = [];

  const sorted = [...keys].sort();
  for (const key of sorted) {
    const loc = localFileExists(uploadsRoot, key);
    if (loc) okLocal++;
    else {
      missingLocal++;
      missingLocalKeys.push(key);
    }
    if (useS3) {
      const s3 = await s3ObjectExists(key);
      if (s3) okS3++;
      else {
        missingS3++;
        missingS3Keys.push(key);
      }
    }
  }

  console.log("Unique upload keys in DB:", keys.size);
  console.log("Local dir:", uploadsRoot);
  console.log("Present locally:", okLocal, "  missing locally:", missingLocal);
  if (useS3) {
    console.log(
      "Present on S3 (any candidate key):",
      okS3,
      "  missing on S3:",
      missingS3
    );
  } else {
    console.log("S3: skipped (S3_UPLOADS_BUCKET not set)");
  }

  if (printMissing) {
    if (missingLocal) {
      console.log("\n--- missing under public/uploads ---");
      for (const k of missingLocalKeys) console.log(k);
    }
    if (useS3 && missingS3) {
      console.log("\n--- missing on S3 (all read candidates tried) ---");
      for (const k of missingS3Keys) console.log(k);
    }
  } else if (missingLocal || (useS3 && missingS3)) {
    console.log('\nTip: re-run with --print-missing to list keys.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
