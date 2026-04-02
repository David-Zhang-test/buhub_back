/**
 * Export all RatingItem and ScoreDimension data to an Excel file.
 *
 * Output: docs/rating-data-export.xlsx (two sheets: RatingItems, ScoreDimensions)
 *
 * Run: cd buhub_back && npx tsx scripts/export-rating-data.ts
 */

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();

async function main() {
  // ── Fetch data ──
  const items = await prisma.ratingItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const dimensions = await prisma.scoreDimension.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });

  console.log(`RatingItems: ${items.length}`);
  console.log(`ScoreDimensions: ${dimensions.length}`);

  // ── Build RatingItems sheet ──
  const itemRows = items.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    department: item.department,
    code: item.code ?? "",
    email: item.email ?? "",
    location: item.location ?? "",
    avatar: item.avatar ?? "",
  }));

  // ── Build ScoreDimensions sheet ──
  const dimRows = dimensions.map((dim) => {
    const label = dim.label as Record<string, string> | null;
    return {
      id: dim.id,
      category: dim.category,
      name: dim.name,
      label_tc: label?.tc ?? "",
      label_sc: label?.sc ?? "",
      label_en: label?.en ?? "",
      order: dim.order,
    };
  });

  // ── Write Excel ──
  const wb = XLSX.utils.book_new();

  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  XLSX.utils.book_append_sheet(wb, wsItems, "RatingItems");

  const wsDims = XLSX.utils.json_to_sheet(dimRows);
  XLSX.utils.book_append_sheet(wb, wsDims, "ScoreDimensions");

  const outDir = path.resolve(__dirname, "../docs");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, "rating-data-export.xlsx");
  XLSX.writeFile(wb, outPath);
  console.log(`\nExported to: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
