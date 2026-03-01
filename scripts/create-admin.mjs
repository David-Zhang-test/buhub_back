#!/usr/bin/env node
/**
 * Create first admin user.
 * Usage: node scripts/create-admin.mjs
 * Requires: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD in .env
 */
import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const BCRYPT_ROUNDS = Number.parseInt(process.env.ADMIN_BCRYPT_ROUNDS ?? "12", 10);

function isStrongPassword(password) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function validateEnv() {
  if (!ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) {
    throw new Error("ADMIN_EMAIL is required and must be a valid email");
  }
  if (!isStrongPassword(ADMIN_PASSWORD)) {
    throw new Error(
      "ADMIN_PASSWORD is required and must be at least 12 chars with upper/lowercase letters, number, and symbol"
    );
  }
  if (!Number.isInteger(BCRYPT_ROUNDS) || BCRYPT_ROUNDS < 10 || BCRYPT_ROUNDS > 15) {
    throw new Error("ADMIN_BCRYPT_ROUNDS must be an integer between 10 and 15");
  }
}

async function main() {
  validateEnv();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
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

  console.log(`Admin login email: ${ADMIN_EMAIL}`);
  console.log("Password is not printed for security.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
