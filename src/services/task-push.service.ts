import { prisma } from "@/src/lib/db";
import { sendPushOnce } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT, buildRemainingLabelLocalized } from "@/src/lib/push-i18n";

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

async function notifyTaskBatch(
  kind: TaskKind,
  records: TaskRecord[],
  builder: (record: TaskRecord, lang: Awaited<ReturnType<typeof getUserLanguage>>) => { dedupeKey: string; ttlSeconds: number; title: string; body: string; data: Record<string, string> },
) {
  let sent = 0;

  for (const record of records) {
    const lang = await getUserLanguage(record.authorId);
    const payload = builder(record, lang);
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

  count.partner = await notifyTaskBatch("partner", partner, (record, lang) => ({
    dedupeKey: `push:task:expiring:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000) + 2 * 24 * 60 * 60,
    title: pushT(lang, "task.expiring.partner"),
    body: pushT(lang, "task.expiring.body", { title: record.title, remaining: buildRemainingLabelLocalized(record.expiresAt, now, lang) }),
    data: {
      type: "task_expiring_soon",
      taskType: "partner",
      itemId: record.id,
      path: buildTaskPath("partner", record.id),
    },
  }));
  count.errand = await notifyTaskBatch("errand", errand, (record, lang) => ({
    dedupeKey: `push:task:expiring:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000) + 2 * 24 * 60 * 60,
    title: pushT(lang, "task.expiring.errand"),
    body: pushT(lang, "task.expiring.body", { title: record.title, remaining: buildRemainingLabelLocalized(record.expiresAt, now, lang) }),
    data: {
      type: "task_expiring_soon",
      taskType: "errand",
      itemId: record.id,
      path: buildTaskPath("errand", record.id),
    },
  }));
  count.secondhand = await notifyTaskBatch("secondhand", secondhand, (record, lang) => ({
    dedupeKey: `push:task:expiring:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000) + 2 * 24 * 60 * 60,
    title: pushT(lang, "task.expiring.secondhand"),
    body: pushT(lang, "task.expiring.body", { title: record.title, remaining: buildRemainingLabelLocalized(record.expiresAt, now, lang) }),
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

  count.partner = await notifyTaskBatch("partner", partner, (record, lang) => ({
    dedupeKey: `push:task:expired:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: 3 * 24 * 60 * 60,
    title: pushT(lang, "task.expired.partner"),
    body: pushT(lang, "task.expired.body", { title: record.title }),
    data: {
      type: "task_expired",
      taskType: "partner",
      itemId: record.id,
      path: buildTaskPath("partner", record.id),
    },
  }));
  count.errand = await notifyTaskBatch("errand", errand, (record, lang) => ({
    dedupeKey: `push:task:expired:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: 3 * 24 * 60 * 60,
    title: pushT(lang, "task.expired.errand"),
    body: pushT(lang, "task.expired.body", { title: record.title }),
    data: {
      type: "task_expired",
      taskType: "errand",
      itemId: record.id,
      path: buildTaskPath("errand", record.id),
    },
  }));
  count.secondhand = await notifyTaskBatch("secondhand", secondhand, (record, lang) => ({
    dedupeKey: `push:task:expired:${record.id}:${record.expiresAt.toISOString()}`,
    ttlSeconds: 3 * 24 * 60 * 60,
    title: pushT(lang, "task.expired.secondhand"),
    body: pushT(lang, "task.expired.body", { title: record.title }),
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
