#!/usr/bin/env node
/**
 * Create first admin user.
 * Usage: node scripts/create-admin.mjs
 * Requires: DATABASE_URL in .env
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'davidzhangtest@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const userName = `admin_${Date.now().toString(36).slice(-8)}`;

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        isBanned: false,
      },
    });
    console.log(`Updated existing user ${ADMIN_EMAIL} to ADMIN.`);
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        emailVerified: true,
        passwordHash,
        userName,
        nickname: 'Admin',
        avatar: 'avatar1.png',
        role: 'ADMIN',
        agreedToTerms: true,
        agreedToTermsAt: new Date(),
        accounts: {
          create: {
            type: 'email',
            provider: 'email',
            providerAccountId: ADMIN_EMAIL,
          },
        },
      },
    });
    console.log(`Created admin user ${ADMIN_EMAIL}.`);
  }

  console.log('Login: email=' + ADMIN_EMAIL + ', password=' + ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
