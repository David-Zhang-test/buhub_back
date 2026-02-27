import { prisma } from "@/src/lib/db";

/**
 * 自动将已过期的帖子标记为过期状态
 * 可以通过 cron job 定期调用此函数
 */
export async function expireOldPosts() {
  const now = new Date();
  const [partnerResult, errandResult, secondhandResult] = await Promise.all([
    prisma.partnerPost.updateMany({
      where: {
        expired: false,
        expiresAt: { lt: now },
      },
      data: { expired: true },
    }),
    prisma.errand.updateMany({
      where: {
        expired: false,
        expiresAt: { lt: now },
      },
      data: { expired: true },
    }),
    prisma.secondhandItem.updateMany({
      where: {
        expired: false,
        expiresAt: { lt: now },
      },
      data: { expired: true },
    }),
  ]);

  return {
    partner: partnerResult.count,
    errand: errandResult.count,
    secondhand: secondhandResult.count,
    total: partnerResult.count + errandResult.count + secondhandResult.count,
  };
}

/**
 * 获取即将过期的帖子数量（用于监控）
 */
export async function getExpiringSoonPosts(hours: number = 24) {
  const now = new Date();
  const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const [partner, errand, secondhand] = await Promise.all([
    prisma.partnerPost.count({
      where: {
        expired: false,
        expiresAt: { gte: now, lte: future },
      },
    }),
    prisma.errand.count({
      where: {
        expired: false,
        expiresAt: { gte: now, lte: future },
      },
    }),
    prisma.secondhandItem.count({
      where: {
        expired: false,
        expiresAt: { gte: now, lte: future },
      },
    }),
  ]);

  return {
    partner,
    errand,
    secondhand,
    total: partner + errand + secondhand,
  };
}
