import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  where: {
    isActive: true,
    isBanned: false,
    role: 'USER',
    emails: {
      some: {
        email: { endsWith: '@life.hkbu.edu.hk' },
        verifiedAt: { not: null },
      },
    },
  },
  select: { userName: true, nickname: true, emails: { select: { email: true } } },
});
console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();
