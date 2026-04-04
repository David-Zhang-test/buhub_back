import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { isLifeHkbuEmail } from "../src/lib/email-domain";
import {
  normalizeEmail,
  USER_EMAIL_TYPE_HKBU,
  USER_EMAIL_TYPE_PRIMARY,
} from "../src/lib/user-emails";

const prisma = new PrismaClient();

const MOCK_USERS = [
  {
    email: "alice@buhub.test",
    password: "Password123",
    userName: "alice_bu",
    nickname: "Alice",
    avatar: "A",
    gender: "female" as const,
    grade: "Year 2",
    major: "Computer Science",
    bio: "Love coding and coffee",
  },
  {
    email: "bob@buhub.test",
    password: "Password123",
    userName: "bob_bu",
    nickname: "Bob",
    avatar: "B",
    gender: "male" as const,
    grade: "Year 3",
    major: "Business",
    bio: "Looking for study buddies",
  },
  {
    email: "carol@buhub.test",
    password: "Password123",
    userName: "carol_bu",
    nickname: "Carol",
    avatar: "C",
    gender: "female" as const,
    grade: "Year 1",
    major: "Journalism",
    bio: "New to campus",
  },
  {
    email: "dave@buhub.test",
    password: "Password123",
    userName: "dave_bu",
    nickname: "Dave",
    avatar: "D",
    gender: "male" as const,
    grade: "Year 4",
    major: "Data Science",
    bio: "Final year project mode",
  },
  {
    email: "eve@buhub.test",
    password: "Password123",
    userName: "eve_bu",
    nickname: "Eve",
    avatar: "E",
    gender: "female" as const,
    grade: "Year 2",
    major: "Music",
    bio: "Piano enthusiast",
  },
];

async function main() {
  console.log("Seeding mock users...");

  for (const u of MOCK_USERS) {
    const norm = normalizeEmail(u.email);
    const existingLink = await prisma.userEmail.findUnique({ where: { email: norm } });
    if (existingLink) {
      console.log(`  Skip ${u.email} (already exists)`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 12);
    const { password: _, email, ...userData } = u;
    const emailType = isLifeHkbuEmail(email) ? USER_EMAIL_TYPE_HKBU : USER_EMAIL_TYPE_PRIMARY;

    await prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        agreedToTerms: true,
        agreedToTermsAt: new Date(),
        emails: {
          create: {
            email: norm,
            type: emailType,
            canLogin: true,
            verifiedAt: new Date(),
          },
        },
      },
    });
    console.log(`  Created ${u.email}`);
  }

  console.log("Done. Mock users:");
  for (const u of MOCK_USERS) {
    console.log(`  ${u.email} / ${u.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
