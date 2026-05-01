import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  const bob   = await p.user.findFirst({ where: { userName: "bob_bu" },   select: { id: true } });
  if (!alice || !bob) process.exit(1);
  const rows = await p.notification.findMany({
    where: { userId: alice.id, type: "like", actorId: bob.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, postId: true, commentId: true, isRead: true, createdAt: true },
  });
  console.log(`bob→alice like notifs: ${rows.length} total, ${rows.filter(r=>!r.isRead).length} unread`);
  for (const r of rows) console.log(`  ${r.createdAt.toISOString()}  isRead=${r.isRead}  post=${r.postId?.slice(0,8)}  comment=${r.commentId?.slice(0,8) ?? '-'}  id=${r.id.slice(0,8)}`);
  await p.$disconnect();
})();
