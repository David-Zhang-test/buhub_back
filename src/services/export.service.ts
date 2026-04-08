import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";
import { createWriteStream } from "fs";

const EXPORT_JOB_TTL = 24 * 60 * 60; // 24h
const EXPORT_DOWNLOAD_TOKEN_TTL = 60 * 60; // 1h, one-time use
const EXPORT_DIR = path.join(process.cwd(), "public", "uploads", "export");

function getAppBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? base.replace(/\/$/, "") : "";
}

function zipFile(inputPath: string, outputZipPath: string, entryName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.file(inputPath, { name: entryName });
    archive.finalize();
  });
}

async function runExport(userId: string, jobId: string) {
  const key = `export:job:${jobId}`;
  try {
    await redis.set(key, JSON.stringify({ userId, status: "processing" }), "EX", EXPORT_JOB_TTL);

    const [user, posts, comments, partnerPosts, errands, secondhandItems] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          nickname: true,
          userName: true,
          bio: true,
          grade: true,
          major: true,
          gender: true,
          language: true,
          createdAt: true,
          emails: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { email: true },
          },
        },
      }),
      prisma.post.findMany({
        where: { authorId: userId, isDeleted: false },
        select: {
          id: true,
          postType: true,
          content: true,
          tags: true,
          images: true,
          category: true,
          isAnonymous: true,
          createdAt: true,
          likeCount: true,
          commentCount: true,
        },
      }),
      prisma.comment.findMany({
        where: { authorId: userId, isDeleted: false },
        select: {
          id: true,
          content: true,
          postId: true,
          createdAt: true,
          likeCount: true,
        },
      }),
      prisma.partnerPost.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          type: true,
          time: true,
          location: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.errand.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          category: true,
          type: true,
          from: true,
          to: true,
          item: true,
          time: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.secondhandItem.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          category: true,
          images: true,
          createdAt: true,
        },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: user
        ? {
            id: user.id,
            email: user.emails[0]?.email ?? null,
            nickname: user.nickname,
            userName: user.userName,
            bio: user.bio,
            grade: user.grade,
            major: user.major,
            gender: user.gender,
            language: user.language,
            createdAt: user.createdAt.toISOString(),
          }
        : null,
      posts: posts.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      comments: comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      partnerPosts: partnerPosts.map((p) => ({
        ...p,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      errands: errands.map((e) => ({
        ...e,
        expiresAt: e.expiresAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      secondhandItems: secondhandItems.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    };

    const userDir = path.join(EXPORT_DIR, userId);
    await mkdir(userDir, { recursive: true });
    const jsonPath = path.join(userDir, `${jobId}.json`);
    await writeFile(jsonPath, JSON.stringify(exportData, null, 2), "utf-8");

    const zipPath = path.join(userDir, `${jobId}.zip`);
    const zipEntryName = `ulink-export-${jobId}.json`;
    await zipFile(jsonPath, zipPath, zipEntryName);

    const downloadToken = crypto.randomBytes(32).toString("hex");
    const tokenKey = `export:download:${downloadToken}`;
    await redis.set(
      tokenKey,
      JSON.stringify({ userId, jobId }),
      "EX",
      EXPORT_DOWNLOAD_TOKEN_TTL
    );

    await redis.set(
      key,
      JSON.stringify({
        userId,
        status: "ready",
        filePath: `uploads/export/${userId}/${jobId}.zip`,
        downloadToken,
      }),
      "EX",
      EXPORT_JOB_TTL
    );
  } catch (err) {
    console.error("[export] job failed:", jobId, err);
    await redis.set(
      key,
      JSON.stringify({ userId, status: "failed" }),
      "EX",
      EXPORT_JOB_TTL
    );
  }
}

export async function createExportJob(userId: string): Promise<string> {
  const jobId = crypto.randomUUID();
  const key = `export:job:${jobId}`;
  await redis.set(
    key,
    JSON.stringify({ userId, status: "pending" }),
    "EX",
    EXPORT_JOB_TTL
  );

  setImmediate(() => {
    runExport(userId, jobId).catch((e) => console.error("[export] runExport error:", e));
  });

  return jobId;
}

export async function getExportJobStatus(
  jobId: string,
  userId: string
): Promise<{ status: string; downloadPath?: string; downloadUrl?: string } | null> {
  const key = `export:job:${jobId}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  const job = JSON.parse(raw) as {
    userId: string;
    status: string;
    filePath?: string;
    downloadToken?: string;
  };
  if (job.userId !== userId) return null;
  const baseUrl = getAppBaseUrl();
  const downloadUrl =
    job.status === "ready" && job.downloadToken && baseUrl
      ? `${baseUrl}/api/user/export/download?token=${job.downloadToken}`
      : undefined;
  return {
    status: job.status,
    downloadPath: job.filePath ? `/${job.filePath}` : undefined,
    downloadUrl,
  };
}

const DOWNLOAD_TOKEN_PREFIX = "export:download:";

/** One-time: resolve token to zip path and delete token. Returns null if invalid. */
export async function consumeDownloadToken(
  token: string
): Promise<{ userId: string; jobId: string } | null> {
  const key = `${DOWNLOAD_TOKEN_PREFIX}${token}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  try {
    return JSON.parse(raw) as { userId: string; jobId: string };
  } catch {
    return null;
  }
}

export function getExportZipPath(userId: string, jobId: string): string {
  return path.join(EXPORT_DIR, userId, `${jobId}.zip`);
}
