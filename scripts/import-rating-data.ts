/**
 * Import RatingItem and ScoreDimension data from the exported Excel file.
 *
 * Source: docs/rating-data-export.xlsx
 *
 * Run: cd buhub_back && npx tsx scripts/import-rating-data.ts
 */

import * as XLSX from "xlsx";
import { PrismaClient, RatingCategory } from "@prisma/client";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const filePath = path.resolve(__dirname, "../docs/rating-data-export.xlsx");
  const wb = XLSX.readFile(filePath);

  // ── Import ScoreDimensions ──
  const dimSheet = wb.Sheets["ScoreDimensions"];
  if (dimSheet) {
    const dimRows = XLSX.utils.sheet_to_json<{
      id: string;
      category: string;
      name: string;
      label_tc: string;
      label_sc: string;
      label_en: string;
      order: number;
    }>(dimSheet);

    console.log(`ScoreDimensions to import: ${dimRows.length}`);

    for (const row of dimRows) {
      await prisma.scoreDimension.upsert({
        where: {
          category_name: {
            category: row.category as RatingCategory,
            name: row.name,
          },
        },
        update: {
          label: { tc: row.label_tc, sc: row.label_sc, en: row.label_en },
          order: row.order,
        },
        create: {
          id: row.id,
          category: row.category as RatingCategory,
          name: row.name,
          label: { tc: row.label_tc, sc: row.label_sc, en: row.label_en },
          order: row.order,
        },
      });
    }
    console.log(`  Done.`);
  }

  // ── Import RatingItems ──
  const itemSheet = wb.Sheets["RatingItems"];
  if (itemSheet) {
    const itemRows = XLSX.utils.sheet_to_json<{
      id: string;
      category: string;
      name: string;
      department: string;
      code: string;
      email: string;
      location: string;
      avatar: string;
    }>(itemSheet);

    console.log(`RatingItems to import: ${itemRows.length}`);

    let created = 0;
    let skipped = 0;

    for (const row of itemRows) {
      const code = row.code || null;
      try {
        await prisma.ratingItem.upsert({
          where: {
            category_code: {
              category: row.category as RatingCategory,
              code: code ?? "",
            },
          },
          update: {
            name: row.name,
            department: row.department,
            email: row.email || null,
            location: row.location || null,
            avatar: row.avatar || null,
          },
          create: {
            id: row.id,
            category: row.category as RatingCategory,
            name: row.name,
            department: row.department,
            code,
            email: row.email || null,
            location: row.location || null,
            avatar: row.avatar || null,
          },
        });
        created++;
      } catch (e: unknown) {
        // Items without a code can't use the unique constraint — insert directly
        if (
          e instanceof Error &&
          e.message.includes("Argument `code` must not be null")
        ) {
          const existing = await prisma.ratingItem.findFirst({
            where: {
              category: row.category as RatingCategory,
              name: row.name,
              department: row.department,
            },
          });
          if (!existing) {
            await prisma.ratingItem.create({
              data: {
                id: row.id,
                category: row.category as RatingCategory,
                name: row.name,
                department: row.department,
                code: null,
                email: row.email || null,
                location: row.location || null,
                avatar: row.avatar || null,
              },
            });
            created++;
          } else {
            skipped++;
          }
        } else {
          throw e;
        }
      }
    }
    console.log(`  Created/updated: ${created}, Skipped (duplicate): ${skipped}`);
  }

  // ── Verify ──
  const counts = await prisma.ratingItem.groupBy({
    by: ["category"],
    _count: { id: true },
  });
  console.log("\nVerification:");
  counts.forEach((c) => console.log(`  ${c.category}: ${c._count.id}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
