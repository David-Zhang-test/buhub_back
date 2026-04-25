import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  where: {
    isActive: true,
    isBanned: false,
    role: 'USER',
    emails: {
      some: {
        AND: [
          { email: { endsWith: '@life.hkbu.edu.hk' } },
          { verifiedAt: { not: null } },
        ],
      },
    },
  },
  select: {
    id: true,
    userName: true,
    nickname: true,
    passwordHash: true,
    emails: { select: { email: true, type: true, verifiedAt: true } },
  },
  take: 3,
});
console.log(JSON.stringify(users.map(u => ({...u, hasPasswordHash: Boolean(u.passwordHash)})), null, 2));
await prisma.$disconnect();
