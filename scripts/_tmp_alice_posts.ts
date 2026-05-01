import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const alice = await p.user.findFirst({ where: { userName: "alice_bu" }, select: { id: true } });
  if (!alice) process.exit(1);
  const posts = await p.post.findMany({
    where: { authorId: alice.id, isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, createdAt: true, commentCount: true },
    take: 5,
  });
  for (const post of posts) {
    const preview = post.content.slice(0, 60).replace(/\n/g, " ");
    console.log(`${post.id}  comments=${post.commentCount}  ${post.createdAt.toISOString()}  "${preview}"`);
  }
  await p.$disconnect();
})();
