/**
 * Seed local DB with users that mirror post-migration reality:
 * Identities: UserEmail only (Account reserved for future OAuth, not written for email.)
 *
 *   cd buhub_back && npx tsx scripts/seed-local-test-users.ts
 *
 * Default password for all: TestPass123
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { normalizeEmail, USER_EMAIL_TYPE_HKBU, USER_EMAIL_TYPE_PRIMARY } from "../src/lib/user-emails";

const prisma = new PrismaClient();

const PASSWORD = "TestPass123";

type SeedUser = {
  key: string;
  userName: string;
  nickname: string;
  emails: { address: string; verified: boolean }[];
  role?: "USER" | "ADMIN" | "MODERATOR";
};

const USERS: SeedUser[] = [
  {
    key: "single_gmail",
    userName: "test_gmail_only",
    nickname: "Gmail Only",
    emails: [{ address: "test.gmail.only@example.com", verified: true }],
  },
  {
    key: "dual_hkbu_bound",
    userName: "test_dual_email",
    nickname: "Gmail+HKBU",
    emails: [
      { address: "test.dual.primary@example.com", verified: true },
      { address: "test.dual@life.hkbu.edu.hk", verified: true },
    ],
  },
  {
    key: "hkbu_only",
    userName: "test_hkbu_only",
    nickname: "HKBU Only",
    emails: [{ address: "test.hkbu@life.hkbu.edu.hk", verified: true }],
  },
  {
    key: "unverified_second",
    userName: "test_unverified_extra",
    nickname: "Extra Unverified",
    emails: [
      { address: "test.unver.primary@example.com", verified: true },
      { address: "test.unver.pending@life.hkbu.edu.hk", verified: false },
    ],
  },
];

async function upsertSeedUser(spec: SeedUser) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  for (const { address } of spec.emails) {
    const norm = normalizeEmail(address);
    const clash = await prisma.user.findFirst({
      where: { emails: { some: { email: norm } } },
      select: { id: true },
    });
    if (clash) {
      console.log(`  skip ${spec.key}: email ${norm} already linked`);
      return;
    }
  }

  await prisma.user.create({
    data: {
      passwordHash,
      userName: spec.userName,
      nickname: spec.nickname,
      avatar: "Harbour",
      bio: `seed:${spec.key}`,
      role: spec.role ?? "USER",
      agreedToTerms: true,
      agreedToTermsAt: new Date(),
      language: "en",
      emails: {
        create: spec.emails.map((e) => ({
          email: normalizeEmail(e.address),
          type: e.address.endsWith("@life.hkbu.edu.hk") ? USER_EMAIL_TYPE_HKBU : USER_EMAIL_TYPE_PRIMARY,
          canLogin: true,
          verifiedAt: e.verified ? new Date() : null,
        })),
      },
    },
  });
  console.log(`  ok ${spec.key} (${spec.userName})`);
}

async function main() {
  console.log("Seeding local test users (password: TestPass123)...");
  for (const u of USERS) {
    await upsertSeedUser(u);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
