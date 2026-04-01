import * as XLSX from "xlsx";
import { PrismaClient, RatingCategory } from "@prisma/client";
import path from "path";
import { redis } from "../src/lib/redis";

const prisma = new PrismaClient();

const KNOWN_TITLES = ["Prof", "Dr", "Mr", "Ms", "Mrs", "Miss"] as const;

type KnownTitle = typeof KNOWN_TITLES[number];

type ScholarRow = {
  rawName: string;
  formattedName: string;
  normalizedName: string;
  email: string;
  department: string;
  title: KnownTitle | null;
};

type TeacherRecord = {
  id: string;
  name: string;
  email: string | null;
  department: string;
};

type PlannedUpdate = {
  kind: "update";
  id: string;
  previousName: string;
  previousEmail: string | null;
  nextName: string;
  nextEmail: string;
};

type PlannedCreate = {
  kind: "create";
  id: string;
  name: string;
  email: string;
  department: string;
};

type PlannedDelete = {
  id: string;
  keepId: string;
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

function normalizeName(name: string): string {
  return stripRoleSuffix(stripTitle(name))
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function buildScholarRows(filePath: string): ScholarRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

  return rows
    .map((row) => {
      const rawName = String(row["Name"] || "").trim();
      const email = String(row["Email"] || "").trim().toLowerCase();
      const department = String(row["Department"] || "").trim();
      return {
        rawName,
        formattedName: formatTeacherName(rawName),
        normalizedName: normalizeName(rawName),
        email,
        department: department || "Hong Kong Baptist University",
        title: extractTitle(rawName),
      };
    })
    .filter((row) => row.rawName && row.email && row.normalizedName);
}

function validateScholarRows(rows: ScholarRow[]): void {
  const emails = new Map<string, ScholarRow[]>();
  const formattedNames = new Map<string, ScholarRow[]>();

  for (const row of rows) {
    if (!emails.has(row.email)) emails.set(row.email, []);
    emails.get(row.email)!.push(row);

    if (!formattedNames.has(row.formattedName)) formattedNames.set(row.formattedName, []);
    formattedNames.get(row.formattedName)!.push(row);
  }

  const duplicateEmails = [...emails.entries()].filter(([, items]) => items.length > 1);
  if (duplicateEmails.length > 0) {
    throw new Error(
      `Excel contains duplicate emails, cannot enforce uniqueness safely: ${duplicateEmails
        .slice(0, 5)
        .map(([email]) => email)
        .join(", ")}`
    );
  }

  const duplicateFormattedNames = [...formattedNames.entries()].filter(([, items]) => items.length > 1);
  if (duplicateFormattedNames.length > 0) {
    throw new Error(
      `Excel contains duplicate formatted teacher names, cannot enforce uniqueness safely: ${duplicateFormattedNames
        .slice(0, 5)
        .map(([name]) => name)
        .join(", ")}`
    );
  }
}

function makeTeacherId(displayName: string, reservedIds: Set<string>): string {
  const baseSlug = slugify(displayName) || "teacher";
  let candidate = `teacher-scholar-${baseSlug}`;
  let counter = 2;
  while (reservedIds.has(candidate)) {
    candidate = `teacher-scholar-${baseSlug}-${counter}`;
    counter += 1;
  }
  reservedIds.add(candidate);
  return candidate;
}

async function main() {
  const shouldExecute = process.argv.includes("--execute");
  const scholarsPath = path.resolve(__dirname, "../../HKBU_Scholars.xls");
  const scholarRows = buildScholarRows(scholarsPath);
  validateScholarRows(scholarRows);
  const scholarNameCounts = new Map<string, number>();
  for (const row of scholarRows) {
    scholarNameCounts.set(row.normalizedName, (scholarNameCounts.get(row.normalizedName) || 0) + 1);
  }

  const existingTeachers = await prisma.ratingItem.findMany({
    where: { category: RatingCategory.TEACHER },
    select: { id: true, name: true, email: true, department: true },
    orderBy: { name: "asc" },
  });

  const existingIds = new Set(existingTeachers.map((teacher) => teacher.id));
  const byNormalizedName = new Map<string, TeacherRecord[]>();
  const byEmail = new Map<string, TeacherRecord>();

  for (const teacher of existingTeachers) {
    const key = normalizeName(teacher.name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
    byNormalizedName.get(key)!.push(teacher);

    const email = String(teacher.email || "").trim().toLowerCase();
    if (email) byEmail.set(email, teacher);
  }

  const claimedTeacherIds = new Set<string>();
  const plannedUpdates = new Map<string, PlannedUpdate>();
  const plannedCreates: PlannedCreate[] = [];
  const ambiguousNameRows: ScholarRow[] = [];

  for (const scholar of scholarRows) {
    const exactEmailMatch = byEmail.get(scholar.email);
    const sameNameCandidates = (byNormalizedName.get(scholar.normalizedName) || []).filter(
      (teacher) => !claimedTeacherIds.has(teacher.id)
    );
    const isAmbiguousScholarName = (scholarNameCounts.get(scholar.normalizedName) || 0) > 1;

    let matchedTeacher: TeacherRecord | null = null;

    if (exactEmailMatch && !claimedTeacherIds.has(exactEmailMatch.id)) {
      matchedTeacher = exactEmailMatch;
    } else if (!isAmbiguousScholarName && sameNameCandidates.length === 1) {
      matchedTeacher = sameNameCandidates[0];
    } else if (sameNameCandidates.length > 1) {
      ambiguousNameRows.push(scholar);
    }

    if (matchedTeacher) {
      claimedTeacherIds.add(matchedTeacher.id);
      plannedUpdates.set(matchedTeacher.id, {
        kind: "update",
        id: matchedTeacher.id,
        previousName: matchedTeacher.name,
        previousEmail: matchedTeacher.email,
        nextName: scholar.formattedName,
        nextEmail: scholar.email,
      });
      continue;
    }

    plannedCreates.push({
      kind: "create",
      id: makeTeacherId(scholar.formattedName, existingIds),
      name: scholar.formattedName,
      email: scholar.email,
      department: scholar.department,
    });
  }

  const desiredEmailOwner = new Map<string, string>();
  for (const update of plannedUpdates.values()) {
    desiredEmailOwner.set(update.nextEmail, update.id);
  }
  for (const create of plannedCreates) {
    desiredEmailOwner.set(create.email, create.id);
  }

  const forcedEmailNullIds = new Set<string>();
  for (const teacher of existingTeachers) {
    const currentEmail = String(teacher.email || "").trim().toLowerCase();
    if (!currentEmail) continue;

    const desiredOwnerId = desiredEmailOwner.get(currentEmail);
    if (!desiredOwnerId) continue;

    const plannedUpdate = plannedUpdates.get(teacher.id);
    const teacherFinalEmail = plannedUpdate ? plannedUpdate.nextEmail : currentEmail;
    if (teacherFinalEmail === currentEmail) continue;

    if (desiredOwnerId !== teacher.id) {
      forcedEmailNullIds.add(teacher.id);
    }
  }

  const projectedRows = new Map<string, { name: string; email: string | null }>();
  for (const teacher of existingTeachers) {
    const plannedUpdate = plannedUpdates.get(teacher.id);
    projectedRows.set(teacher.id, {
      name: plannedUpdate ? plannedUpdate.nextName : teacher.name,
      email: plannedUpdate
        ? plannedUpdate.nextEmail
        : forcedEmailNullIds.has(teacher.id)
          ? null
          : teacher.email,
    });
  }
  for (const create of plannedCreates) {
    projectedRows.set(create.id, { name: create.name, email: create.email });
  }

  const scholarByNormalizedName = new Map<string, ScholarRow[]>();
  for (const scholar of scholarRows) {
    if (!scholarByNormalizedName.has(scholar.normalizedName)) scholarByNormalizedName.set(scholar.normalizedName, []);
    scholarByNormalizedName.get(scholar.normalizedName)!.push(scholar);
  }

  const projectedNormalizedGroups = new Map<string, string[]>();
  for (const [id, row] of projectedRows.entries()) {
    const key = normalizeName(row.name);
    if (!projectedNormalizedGroups.has(key)) projectedNormalizedGroups.set(key, []);
    projectedNormalizedGroups.get(key)!.push(id);
  }

  const plannedDeletes: PlannedDelete[] = [];
  const deletedIds = new Set<string>();
  for (const [normalizedName, ids] of projectedNormalizedGroups.entries()) {
    if (ids.length <= 1) continue;

    const scholarMatches = scholarByNormalizedName.get(normalizedName) || [];
    if (scholarMatches.length !== 1) continue;

    const scholar = scholarMatches[0];
    const keeperId =
      ids.find((id) => projectedRows.get(id)?.email === scholar.email) ||
      ids.find((id) => projectedRows.get(id)?.name === scholar.formattedName) ||
      ids.find((id) => projectedRows.get(id)?.email) ||
      ids[0];

    for (const id of ids) {
      if (id === keeperId) continue;
      deletedIds.add(id);
      plannedDeletes.push({ id, keepId: keeperId });
    }
  }

  const projectedNameOwners = new Map<string, string>();
  const projectedEmailOwners = new Map<string, string>();
  for (const [id, row] of projectedRows.entries()) {
    if (deletedIds.has(id)) continue;

    if (projectedNameOwners.has(row.name) && projectedNameOwners.get(row.name) !== id) {
      throw new Error(`Projected duplicate teacher name detected: ${row.name}`);
    }
    projectedNameOwners.set(row.name, id);

    const email = String(row.email || "").trim().toLowerCase();
    if (!email) continue;

    if (projectedEmailOwners.has(email) && projectedEmailOwners.get(email) !== id) {
      throw new Error(`Projected duplicate teacher email detected: ${email}`);
    }
    projectedEmailOwners.set(email, id);
  }

  const updatesChangingName = [...plannedUpdates.values()].filter((item) => item.previousName !== item.nextName).length;
  const updatesChangingEmail = [...plannedUpdates.values()].filter(
    (item) => String(item.previousEmail || "").trim().toLowerCase() !== item.nextEmail
  ).length;

  console.log(
    JSON.stringify(
      {
        scholarRows: scholarRows.length,
        existingTeachers: existingTeachers.length,
        plannedCreates: plannedCreates.length,
        plannedUpdates: plannedUpdates.size,
        plannedDeletes: plannedDeletes.length,
        updatesChangingName,
        updatesChangingEmail,
        forcedEmailNulls: forcedEmailNullIds.size,
        ambiguousSameNameRows: ambiguousNameRows.length,
        ambiguousSameNameExamples: ambiguousNameRows.slice(0, 10),
        createExamples: plannedCreates.slice(0, 10),
        updateExamples: [...plannedUpdates.values()].slice(0, 10),
        deleteExamples: plannedDeletes.slice(0, 10),
        forcedEmailNullExamples: existingTeachers
          .filter((teacher) => forcedEmailNullIds.has(teacher.id))
          .slice(0, 10),
      },
      null,
      2
    )
  );

  if (!shouldExecute) {
    console.log("\nDry run only. Re-run with --execute to apply the changes.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const teacherId of forcedEmailNullIds) {
      if (plannedUpdates.has(teacherId)) continue;
      await tx.ratingItem.update({
        where: { id: teacherId },
        data: { email: null },
      });
    }

    for (const update of plannedUpdates.values()) {
      await tx.ratingItem.update({
        where: { id: update.id },
        data: {
          name: update.nextName,
          email: update.nextEmail,
        },
      });
    }

    for (const create of plannedCreates) {
      await tx.ratingItem.create({
        data: {
          id: create.id,
          category: RatingCategory.TEACHER,
          name: create.name,
          department: create.department,
          email: create.email,
          avatar: "",
        },
      });
    }

    for (const deletion of plannedDeletes) {
      await tx.rating.updateMany({
        where: { itemId: deletion.id },
        data: { itemId: deletion.keepId },
      });
      await tx.ratingItem.delete({
        where: { id: deletion.id },
      });
    }
  }, { timeout: 120000, maxWait: 120000 });

  try {
    await redis.del("rating:list:TEACHER:recent", "rating:list:TEACHER:controversial");
  } catch {
    // Ignore cache failures — DB sync already succeeded
  }

  console.log("\nSync completed successfully.");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
