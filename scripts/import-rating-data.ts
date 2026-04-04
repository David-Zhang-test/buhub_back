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

async function clearRatingCaches() {
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const keys = await redis.keys("rating:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    console.log(`Cleared ${keys.length} rating cache keys`);
    await redis.quit();
  } catch {
    console.log("Rating cache clear skipped (Redis not available)");
  }
}

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
          id: String(row.id).trim(),
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

    let upserted = 0;

    for (const row of itemRows) {
      const id = String(row.id).trim();
      const category = row.category as RatingCategory;
      const codeRaw = row.code;
      const code =
        codeRaw != null && String(codeRaw).trim() !== ""
          ? String(codeRaw).trim()
          : null;

      const data = {
        category,
        name: row.name,
        department: row.department,
        code,
        email: row.email || null,
        location: row.location || null,
        avatar: row.avatar || null,
      };

      const byId = await prisma.ratingItem.findUnique({ where: { id } });
      if (byId) {
        await prisma.ratingItem.update({ where: { id }, data });
        upserted++;
        continue;
      }

      if (code != null) {
        const byCode = await prisma.ratingItem.findUnique({
          where: { category_code: { category, code } },
        });
        if (byCode) {
          await prisma.ratingItem.update({
            where: { id: byCode.id },
            data,
          });
          upserted++;
          continue;
        }
      }

      await prisma.ratingItem.create({ data: { id, ...data } });
      upserted++;
    }
    console.log(`  Upserted: ${upserted}`);
  }

  // ── Verify ──
  const counts = await prisma.ratingItem.groupBy({
    by: ["category"],
    _count: { id: true },
  });
  console.log("\nVerification:");
  counts.forEach((c) => console.log(`  ${c.category}: ${c._count.id}`));

  await clearRatingCaches();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
