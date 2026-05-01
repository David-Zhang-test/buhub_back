import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  if (!alice) { console.log("alice not found"); process.exit(1); }
  const [likes, followers, comments, mentions, messages] = await Promise.all([
    p.notification.count({ where: { userId: alice.id, type: "like", isRead: false } }),
    p.notification.count({ where: { userId: alice.id, type: "follow", isRead: false } }),
    p.notification.count({ where: { userId: alice.id, type: "comment", isRead: false } }),
    p.notification.count({ where: { userId: alice.id, type: "mention", isRead: false } }),
    p.directMessage.count({ where: { receiverId: alice.id, isRead: false, isDeleted: false } }),
  ]);
  console.log(`alice unread breakdown:`);
  console.log(`  likes:     ${likes}`);
  console.log(`  followers: ${followers}   ← Plan B locks this at 1 regardless of unfollow/refollow cycles`);
  console.log(`  comments:  ${comments + mentions}  (comment=${comments} + mention=${mentions})`);
  console.log(`  messages:  ${messages}`);
  console.log(`  ----------`);
  console.log(`  TOTAL:     ${likes + followers + comments + mentions + messages}  ← bottom-tab badge`);
  await p.$disconnect();
})();
