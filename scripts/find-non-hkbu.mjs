import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Find users WITHOUT a verified @life.hkbu.edu.hk email — i.e. unverified
// (non-HKBU) accounts that still pass the active/non-banned filters.
const candidates = await prisma.user.findMany({
  where: {
    isActive: true,
    isBanned: false,
    role: 'USER',
    emails: {
      none: {
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
    role: true,
    createdAt: true,
    emails: { select: { email: true, type: true, verifiedAt: true } },
  },
  take: 5,
  orderBy: { createdAt: 'desc' },
});

console.log(JSON.stringify(candidates, null, 2));
console.log('\nTotal returned:', candidates.length);
await prisma.$disconnect();
