import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  if (!alice) process.exit(1);
  const r = await p.notification.updateMany({
    where: { userId: alice.id, type: "follow", isRead: false },
    data: { isRead: true },
  });
  console.log(`marked ${r.count} of alice's follow notifs as read (baseline reset)`);
  await p.$disconnect();
})();
