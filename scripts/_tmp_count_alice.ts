import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  if (!alice) { console.log("alice not found"); process.exit(1); }
  const rows = await p.notification.findMany({
    where: { userId: alice.id, type: "follow" },
    orderBy: { createdAt: "desc" },
    select: { id: true, actorId: true, isRead: true, createdAt: true, actor: { select: { userName: true } } },
  });
  console.log(`alice has ${rows.length} follow notification rows total, ${rows.filter(r=>!r.isRead).length} unread`);
  for (const r of rows) console.log(`  ${r.createdAt.toISOString()}  isRead=${r.isRead}  actor=${r.actor?.userName}  id=${r.id.slice(0,8)}`);
  await p.$disconnect();
})();
