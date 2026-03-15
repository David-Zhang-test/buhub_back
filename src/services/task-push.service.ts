import { prisma } from "@/src/lib/db";
import { sendPushOnce } from "@/src/services/expo-push.service";

type TaskKind = "partner" | "errand" | "secondhand";

type TaskRecord = {
  id: string;
  title: string;
  authorId: string;
  expiresAt: Date;
};

type TaskPushCount = {
  partner: number;
  errand: number;
  secondhand: number;
  total: number;
};

function createEmptyCount(): TaskPushCount {
  return {
    partner: 0,
    errand: 0,
    secondhand: 0,
    total: 0,
  };
}

function buildTaskPath(kind: TaskKind, id: string): string {
  switch (kind) {
    case "partner":
      return `partner/${id}`;
    case "errand":
      return `errand/${id}`;
    case "secondhand":
      return `secondhand/${id}`;
  }
}

function buildRemainingLabel(expiresAt: Date, now: Date): string {
  const diffMs = expiresAt.getTime() - now.getTime();
  const hours = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
  if (hours <= 1) return "within 1 hour";
  if (hours < 24) return `in ${hours} hours`;
  const days = Math.ceil(hours / 24);
  return days <= 1 ? "within 24 hours" : `in ${days} days`;
}

async function notifyTaskBatch(
  kind: TaskKind,
  records: TaskRecord[],
  builder: (record: TaskRecord) => { dedupeKey: string; ttlSeconds: number; title: string; body: string; data: Record<string, string> },
) {
  let sent = 0;

  for (const record of records) {
    const payload = builder(record);
    const result = await sendPushOnce({
      dedupeKey: payload.dedupeKey,
      ttlSeconds: payload.ttlSeconds,
      userId: record.authorId,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      category: "system",
    });
    if (!result.skipped && result.attempted > 0) {
      sent += 1;
    }
  }

  return sent;
}

export async function sendExpiringSoonTaskPushes(hours = 24): Promise<TaskPushCount> {
  const now = new Date();
  const future = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const count = createEmptyCount();

  const [partner, errand, secondhand] = await Promise.all([
    prisma.partnerPost.findMany({
      where: {
        expired: false,
        expiresAt: { gte: now, lte: future },
      },
      select: { id: true, title: true, authorId: true, expiresAt: true },
    }),
    prisma.errand.findMany({
      where: {
        expired: false,
        expiresAt: { gte: now, lte: future },
      },
      select: { id: true, title: true, authorId: true, expiresAt: true },
    }),
    prisma.secondhandItem.findMany({
      where: {
        expired: false,
        expiresAt: { gte: now, lte: future },
      },
      select: { id: true, title: true, authorId: true, expiresAt: true },
    }),
  ]);

  count.partner = await notifyTaskBatch("partner", partner, (record) => ({
    dedupeKey: `push:task:expiring:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000) + 2 * 24 * 60 * 60,
    title: "Your buddy-up post expires soon",
    body: `"${record.title}" expires ${buildRemainingLabel(record.expiresAt, now)}.`,
    data: {
      type: "task_expiring_soon",
      taskType: "partner",
      itemId: record.id,
      path: buildTaskPath("partner", record.id),
    },
  }));
  count.errand = await notifyTaskBatch("errand", errand, (record) => ({
    dedupeKey: `push:task:expiring:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000) + 2 * 24 * 60 * 60,
    title: "Your errand post expires soon",
    body: `"${record.title}" expires ${buildRemainingLabel(record.expiresAt, now)}.`,
    data: {
      type: "task_expiring_soon",
      taskType: "errand",
      itemId: record.id,
      path: buildTaskPath("errand", record.id),
    },
  }));
  count.secondhand = await notifyTaskBatch("secondhand", secondhand, (record) => ({
    dedupeKey: `push:task:expiring:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000) + 2 * 24 * 60 * 60,
    title: "Your secondhand listing expires soon",
    body: `"${record.title}" expires ${buildRemainingLabel(record.expiresAt, now)}.`,
    data: {
      type: "task_expiring_soon",
      taskType: "secondhand",
      itemId: record.id,
      path: buildTaskPath("secondhand", record.id),
    },
  }));

  count.total = count.partner + count.errand + count.secondhand;
  return count;
}

export async function sendExpiredTaskPushes(lookbackHours = 30): Promise<TaskPushCount> {
  const now = new Date();
  const past = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const count = createEmptyCount();

  const [partner, errand, secondhand] = await Promise.all([
    prisma.partnerPost.findMany({
      where: {
        expired: true,
        expiresAt: { gte: past, lte: now },
      },
      select: { id: true, title: true, authorId: true, expiresAt: true },
    }),
    prisma.errand.findMany({
      where: {
        expired: true,
        expiresAt: { gte: past, lte: now },
      },
      select: { id: true, title: true, authorId: true, expiresAt: true },
    }),
    prisma.secondhandItem.findMany({
      where: {
        expired: true,
        expiresAt: { gte: past, lte: now },
      },
      select: { id: true, title: true, authorId: true, expiresAt: true },
    }),
  ]);

  count.partner = await notifyTaskBatch("partner", partner, (record) => ({
    dedupeKey: `push:task:expired:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: 3 * 24 * 60 * 60,
    title: "Your buddy-up post has expired",
    body: `"${record.title}" is now marked as expired.`,
    data: {
      type: "task_expired",
      taskType: "partner",
      itemId: record.id,
      path: buildTaskPath("partner", record.id),
    },
  }));
  count.errand = await notifyTaskBatch("errand", errand, (record) => ({
    dedupeKey: `push:task:expired:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: 3 * 24 * 60 * 60,
    title: "Your errand post has expired",
    body: `"${record.title}" is now marked as expired.`,
    data: {
      type: "task_expired",
      taskType: "errand",
      itemId: record.id,
      path: buildTaskPath("errand", record.id),
    },
  }));
  count.secondhand = await notifyTaskBatch("secondhand", secondhand, (record) => ({
    dedupeKey: `push:task:expired:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: 3 * 24 * 60 * 60,
    title: "Your secondhand listing has expired",
    body: `"${record.title}" is now marked as expired.`,
    data: {
      type: "task_expired",
      taskType: "secondhand",
      itemId: record.id,
      path: buildTaskPath("secondhand", record.id),
    },
  }));

  count.total = count.partner + count.errand + count.secondhand;
  return count;
}
