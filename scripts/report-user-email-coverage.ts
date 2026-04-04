/**
 * Report User vs UserEmail coverage (run before/after removing User.email).
 *
 * Usage:
 *   cd buhub_back && DATABASE_URL=... npx tsx scripts/report-user-email-coverage.ts
 *
 * After migration, "users_with_legacy_email_column" will be 0 (column dropped).
 * Use this against production read replica or with care on primary.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [userCount, userEmailCount, usersMissingRow] = await Promise.all([
    prisma.user.count(),
    prisma.userEmail.count(),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
      FROM "User" u
      WHERE NOT EXISTS (SELECT 1 FROM "UserEmail" ue WHERE ue."userId" = u.id)
    `,
  ]);

  const orphanEmails = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
    FROM "UserEmail" ue
    WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = ue."userId")
  `;

  console.log(JSON.stringify(
    {
      users: userCount,
      userEmailRows: userEmailCount,
      usersWithNoUserEmailRow: Number(usersMissingRow[0]?.n ?? 0),
      orphanUserEmailRows: Number(orphanEmails[0]?.n ?? 0),
      note: "Before dropping User.email: run migration backfill; usersWithNoUserEmailRow should be 0.",
    },
    null,
    2
  ));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
