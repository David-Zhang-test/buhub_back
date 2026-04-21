const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const fbs = await prisma.feedback.findMany();
  console.log(fbs);
}
main().catch(console.error).finally(() => prisma.$disconnect());
