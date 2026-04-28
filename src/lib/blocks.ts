import { prisma } from "@/src/lib/db";

/**
 * Returns the set of user IDs that should be hidden from `viewerId` because
 * one side has blocked the other. Symmetric: includes both
 * `viewerId blocked X` and `X blocked viewerId` directions.
 *
 * Use this in any route that returns user-generated content or interactions
 * so a blocked partner cannot leak posts, comments, function-card listings,
 * notifications, or any other surface to the host.
 */
export async function getBlockedUserIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const set = new Set<string>();
  for (const row of rows) {
    set.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
  }
  return Array.from(set);
}
