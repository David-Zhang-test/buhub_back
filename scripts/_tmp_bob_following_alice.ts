import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  const bob   = await p.user.findFirst({ where: { userName: "bob_bu" },   select: { id: true } });
  if (!alice || !bob) process.exit(1);
  const f = await p.follow.findUnique({
    where: { followerId_followingId: { followerId: bob.id, followingId: alice.id } },
  });
  console.log(f ? `❌ bob IS following alice (since ${f.createdAt.toISOString()})` : `✅ bob is NOT following alice`);
  await p.$disconnect();
})();
