import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const EXPORT_JOB_TTL = 24 * 60 * 60; // 24h
const EXPORT_DIR = path.join(process.cwd(), "public", "uploads", "export");

async function runExport(userId: string, jobId: string) {
  const key = `export:job:${jobId}`;
  try {
    await redis.set(key, JSON.stringify({ userId, status: "processing" }), "EX", EXPORT_JOB_TTL);

    const [user, posts, comments, partnerPosts, errands, secondhandItems] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          nickname: true,
          userName: true,
          bio: true,
          grade: true,
          major: true,
          gender: true,
          language: true,
          createdAt: true,
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
          content: true,
          partnerType: true,
          eventEndDate: true,
          createdAt: true,
        },
      }),
      prisma.errand.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          content: true,
          price: true,
          errandType: true,
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
            ...user,
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
        eventEndDate: p.eventEndDate?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      errands: errands.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      secondhandItems: secondhandItems.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    };

    const userDir = path.join(EXPORT_DIR, userId);
    await mkdir(userDir, { recursive: true });
    const filePath = path.join(userDir, `${jobId}.json`);
    await writeFile(filePath, JSON.stringify(exportData, null, 2), "utf-8");

    await redis.set(
      key,
      JSON.stringify({
        userId,
        status: "ready",
        filePath: `uploads/export/${userId}/${jobId}.json`,
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
): Promise<{ status: string; downloadPath?: string } | null> {
  const key = `export:job:${jobId}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  const job = JSON.parse(raw) as { userId: string; status: string; filePath?: string };
  if (job.userId !== userId) return null;
  return {
    status: job.status,
    downloadPath: job.filePath ? `/${job.filePath}` : undefined,
  };
}
