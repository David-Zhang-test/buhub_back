import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRawInviteCode() {
  let result = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
    result += INVITE_CODE_CHARS[randomIndex];
  }
  return result;
}

async function createInviteCodesForUser(ownerUserId, count) {
  let created = 0;
  while (created < count) {
    let retries = 0;
    while (retries < 20) {
      const code = generateRawInviteCode();
      const exists = await prisma.inviteCode.findUnique({ where: { code }, select: { id: true } });
      if (!exists) {
        await prisma.inviteCode.create({
          data: {
            code,
            ownerUserId,
          },
        });
        created += 1;
        break;
      }
      retries += 1;
    }

    if (retries >= 20) {
      throw new Error("Failed to generate unique invite code");
    }
  }
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      _count: { select: { ownedInviteCodes: true } },
    },
  });

  let affected = 0;
  for (const user of users) {
    const missing = Math.max(0, 3 - user._count.ownedInviteCodes);
    if (missing > 0) {
      await createInviteCodesForUser(user.id, missing);
      affected += 1;
      console.log(`Backfilled ${missing} invite code(s) for ${user.email || user.id}`);
    }
  }

  console.log(`Done. Updated users: ${affected}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
