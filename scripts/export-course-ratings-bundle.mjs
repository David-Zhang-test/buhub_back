import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = path.resolve(__dirname, "../docs/course-ratings-import-bundle.xlsx");

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--file" && args[i + 1]) {
      filePath = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    }
  }

  return { filePath };
}

function toSafeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoString(value) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function extractEmail(user) {
  const primary = Array.isArray(user?.emails) ? user.emails.find((item) => item?.type === "primary") : null;
  const hkbu = Array.isArray(user?.emails) ? user.emails.find((item) => item?.type === "hkbu") : null;
  return primary?.email ?? hkbu?.email ?? "";
}

function buildScoreColumns(scores) {
  const entries = Object.entries(scores ?? {}).slice(0, 3);
  const row = {};
  for (let index = 0; index < 3; index += 1) {
    const pair = entries[index];
    row[`score_${index + 1}_key`] = pair?.[0] ?? "";
    row[`score_${index + 1}_value`] = pair?.[1] ?? "";
  }
  return row;
}

async function main() {
  const { filePath } = parseArgs();

  const ratedCourses = await prisma.ratingItem.findMany({
    where: {
      category: "COURSE",
      ratings: { some: {} },
    },
    include: {
      ratings: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              emails: {
                select: {
                  email: true,
                  type: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const dimensions = await prisma.scoreDimension.findMany({
    where: { category: "COURSE" },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  const ratingItemRows = ratedCourses.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    department: item.department,
    code: item.code ?? "",
    email: item.email ?? "",
    location: item.location ?? "",
    avatar: item.avatar ?? "",
  }));

  const scoreDimensionRows = dimensions.map((dimension) => {
    const label = typeof dimension.label === "object" && dimension.label ? dimension.label : {};
    return {
      category: dimension.category,
      name: dimension.name,
      label_tc: toSafeString(label.tc),
      label_sc: toSafeString(label.sc),
      label_en: toSafeString(label.en),
      left_tc: toSafeString(label.left_tc),
      left_sc: toSafeString(label.left_sc),
      left_en: toSafeString(label.left_en),
      right_tc: toSafeString(label.right_tc),
      right_sc: toSafeString(label.right_sc),
      right_en: toSafeString(label.right_en),
      order: dimension.order,
    };
  });

  const userMap = new Map();
  const userRows = [];
  const ratingRows = [];

  for (const item of ratedCourses) {
    for (const rating of item.ratings) {
      const user = rating.user;
      const userRef = `course-rating-${user.id}`;

      if (!userMap.has(user.id)) {
        userMap.set(user.id, userRef);
        userRows.push({
          user_ref: userRef,
          mode: "seed",
          user_id: "",
          nickname: user?.nickname ?? userRef,
          email: extractEmail(user),
        });
      }

      ratingRows.push({
        item_id: item.id,
        category: item.category,
        user_ref: userRef,
        semester: rating.semester ?? "",
        ...buildScoreColumns(rating.scores),
        tags: Array.isArray(rating.tags) ? rating.tags.join(",") : "",
        comment: rating.comment ?? "",
        created_at: toIsoString(rating.createdAt),
        updated_at: toIsoString(rating.updatedAt),
      });
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ratingItemRows), "RatingItems");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(scoreDimensionRows), "ScoreDimensions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(userRows), "Users");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ratingRows), "Ratings");

  const outDir = path.dirname(filePath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  XLSX.writeFile(workbook, filePath);

  console.log(
    JSON.stringify(
      {
        filePath,
        ratingItems: ratingItemRows.length,
        scoreDimensions: scoreDimensionRows.length,
        users: userRows.length,
        ratings: ratingRows.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
