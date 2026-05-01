import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  const bob   = await p.user.findFirst({ where: { userName: "bob_bu" },   select: { id: true } });
  if (!alice || !bob) process.exit(1);
  const r = await p.notification.updateMany({
    where: { userId: alice.id, type: "follow", actorId: bob.id },
    data: { isRead: false },
  });
  console.log(`marked ${r.count} of bob→alice follow notif(s) back to UNREAD`);
  await p.$disconnect();
})();
