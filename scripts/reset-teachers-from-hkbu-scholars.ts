import * as XLSX from "xlsx";
import { PrismaClient, RatingCategory } from "@prisma/client";
import path from "path";
import { redis } from "../src/lib/redis";

const prisma = new PrismaClient();

const KNOWN_TITLES = ["Prof", "Dr", "Mr", "Ms", "Mrs", "Miss"] as const;

type KnownTitle = typeof KNOWN_TITLES[number];

type TeacherRow = {
  id: string;
  name: string;
  email: string;
  department: string;
};

function toTitleCaseTitle(value: string): KnownTitle | null {
  const normalized = value.replace(/\./g, "").trim().toLowerCase();
  const match = KNOWN_TITLES.find((title) => title.toLowerCase() === normalized);
  return match ?? null;
}

function extractTitle(name: string): KnownTitle | null {
  const trimmed = String(name || "").trim();
  const suffixMatch = trimmed.match(/,\s*(?:Rev\s+)?(Prof|Dr|Mr|Ms|Mrs|Miss)\.?$/i);
  if (suffixMatch) return toTitleCaseTitle(suffixMatch[1]);

  const trailingTitleMatch = trimmed.match(/(?:^|\s)(?:Rev\s+)?(Prof|Dr|Mr|Ms|Mrs|Miss)\.?$/i);
  if (trailingTitleMatch) return toTitleCaseTitle(trailingTitleMatch[1]);

  const prefixMatch = trimmed.match(/^(Prof|Dr|Mr|Ms|Mrs|Miss)\.?\s+/i);
  if (prefixMatch) return toTitleCaseTitle(prefixMatch[1]);

  return null;
}

function stripTitle(name: string): string {
  const withoutPrefix = String(name || "")
    .replace(/^(Prof|Dr|Mr|Ms|Mrs|Miss)\.?\s+/i, "")
    .trim();

  const beforeComma = withoutPrefix.includes(",")
    ? withoutPrefix.split(",")[0].trim()
    : withoutPrefix;

  return beforeComma
    .replace(/\s+(?:Rev\s+)?(Prof|Dr|Mr|Ms|Mrs|Miss)\.?$/i, "")
    .trim();
}

function stripRoleSuffix(name: string): string {
  return name
    .replace(
      /\s+(Chair\s+Professor|Associate\s+Professor|Assistant\s+Professor|Adjunct\s+Professor|Visiting\s+Professor|Professor|Associate\s+Dean|Assistant\s+Dean|Dean|Associate\s+Director|Assistant\s+Director|Director|Head|Manager|Officer|Provost)\b.*$/i,
      ""
    )
    .trim();
}

function formatTeacherName(name: string): string {
  const title = extractTitle(name);
  const base = stripRoleSuffix(stripTitle(name)).replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
  return title ? `${title} ${base}` : base;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildTeacherRows(filePath: string): TeacherRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

  const reservedIds = new Set<string>();
  const teachers: TeacherRow[] = [];
  const byName = new Map<string, TeacherRow[]>();
  const byEmail = new Map<string, TeacherRow[]>();

  for (const row of rows) {
    const rawName = String(row["Name"] || "").trim();
    const email = String(row["Email"] || "").trim().toLowerCase();
    const department = String(row["Department"] || "").trim() || "Hong Kong Baptist University";
    const name = formatTeacherName(rawName);

    if (!name || !email) continue;

    const baseSlug = slugify(name) || "teacher";
    let id = `teacher-scholar-${baseSlug}`;
    let counter = 2;
    while (reservedIds.has(id)) {
      id = `teacher-scholar-${baseSlug}-${counter}`;
      counter += 1;
    }
    reservedIds.add(id);

    const teacher = { id, name, email, department };
    teachers.push(teacher);

    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(teacher);

    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email)!.push(teacher);
  }

  const duplicateNames = [...byName.entries()].filter(([, items]) => items.length > 1);
  if (duplicateNames.length > 0) {
    throw new Error(
      `Excel contains duplicate teacher names after formatting: ${duplicateNames
        .slice(0, 5)
        .map(([name]) => name)
        .join(", ")}`
    );
  }

  const duplicateEmails = [...byEmail.entries()].filter(([, items]) => items.length > 1);
  if (duplicateEmails.length > 0) {
    throw new Error(
      `Excel contains duplicate teacher emails: ${duplicateEmails
        .slice(0, 5)
        .map(([email]) => email)
        .join(", ")}`
    );
  }

  return teachers;
}

async function main() {
  const shouldExecute = process.argv.includes("--execute");
  const scholarsPath = path.resolve(__dirname, "../../HKBU_Scholars.xls");
  const teachers = buildTeacherRows(scholarsPath);

  const currentTeacherCount = await prisma.ratingItem.count({
    where: { category: RatingCategory.TEACHER },
  });

  console.log(
    JSON.stringify(
      {
        currentTeacherCount,
        excelTeacherCount: teachers.length,
        sampleTeachers: teachers.slice(0, 10),
      },
      null,
      2
    )
  );

  if (!shouldExecute) {
    console.log("\nDry run only. Re-run with --execute to replace all teacher records with the Excel data.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.rating.deleteMany({
      where: { item: { category: RatingCategory.TEACHER } },
    });

    await tx.ratingItem.deleteMany({
      where: { category: RatingCategory.TEACHER },
    });

    for (const teacher of teachers) {
      await tx.ratingItem.create({
        data: {
          id: teacher.id,
          category: RatingCategory.TEACHER,
          name: teacher.name,
          department: teacher.department,
          email: teacher.email,
          avatar: "",
        },
      });
    }
  }, { timeout: 120000, maxWait: 120000 });

  try {
    await redis.del("rating:list:TEACHER:recent", "rating:list:TEACHER:controversial");
  } catch {
    // Ignore cache failures — DB import already succeeded
  }

  console.log("\nTeacher reset import completed successfully.");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
