import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient, RatingCategory } from "@prisma/client";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = path.resolve(__dirname, "../docs/rating-import-template.xlsx");
  let execute = false;
  let mode = "append";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    if (arg === "--file" && args[i + 1]) {
      filePath = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--mode" && args[i + 1]) {
      const next = args[i + 1];
      if (next === "append" || next === "replace_by_category") {
        mode = next;
      } else {
        throw new Error(`Unsupported mode: ${args[i + 1]}`);
      }
      i += 1;
    }
  }

  return { filePath, execute, mode };
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCategory(value) {
  const normalized = sanitizeText(value).toUpperCase();
  if (!Object.values(RatingCategory).includes(normalized)) {
    throw new Error(`Unsupported category: ${String(value)}`);
  }
  return normalized;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function toOptionalString(value) {
  const normalized = sanitizeText(value);
  return normalized || null;
}

function normalizeEmailAddress(email) {
  return email.trim().toLowerCase();
}

function getUserEmailType(email) {
  return normalizeEmailAddress(email).endsWith("@life.hkbu.edu.hk") ? "hkbu" : "primary";
}

async function syncSeedUserEmail(userId, rawEmail) {
  const email = toOptionalString(rawEmail);
  if (!email) return;

  const normalizedEmail = normalizeEmailAddress(email);
  const existing = await prisma.userEmail.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, userId: true },
  });

  if (existing && existing.userId !== userId) {
    throw new Error(`Users sheet: email already linked to another user: ${normalizedEmail}`);
  }

  if (existing) {
    await prisma.userEmail.update({
      where: { id: existing.id },
      data: {
        type: getUserEmailType(normalizedEmail),
        canLogin: true,
        verifiedAt: new Date(),
      },
    });
    return;
  }

  await prisma.userEmail.create({
    data: {
      userId,
      email: normalizedEmail,
      type: getUserEmailType(normalizedEmail),
      canLogin: true,
      verifiedAt: new Date(),
    },
  });
}

function toScoreValue(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 5) {
    throw new Error(`Invalid score value: ${String(value)}. Expected 0-5.`);
  }
  return Math.round(numeric * 100) / 100;
}

function parseTags(raw) {
  const text = sanitizeText(raw);
  if (!text) return [];
  const tags = Array.from(new Set(text.split(",").map((part) => part.trim()).filter(Boolean)));
  if (tags.length > 10) {
    throw new Error(`Too many tags: ${tags.length}. Max is 10.`);
  }
  return tags;
}

function parseDateOrNull(raw) {
  const text = sanitizeText(raw);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${text}`);
  }
  return date;
}

function loadSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function resolveUsers(userRows) {
  const resolved = new Map();

  for (const row of userRows) {
    const userRef = sanitizeText(row.user_ref);
    if (!userRef) continue;

    const mode = sanitizeText(row.mode).toLowerCase();
    if (mode === "existing") {
      const userId = sanitizeText(row.user_id);
      if (!userId) {
        throw new Error(`Users sheet: existing mode requires user_id for ${userRef}`);
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        throw new Error(`Users sheet: existing user not found for ${userRef}: ${userId}`);
      }
      resolved.set(userRef, user.id);
      continue;
    }

    if (mode === "seed") {
      const seedId = `import-rater-${slugify(userRef) || "user"}`;
      await prisma.user.upsert({
        where: { id: seedId },
        update: {
          nickname: sanitizeText(row.nickname) || userRef,
        },
        create: {
          id: seedId,
          nickname: sanitizeText(row.nickname) || userRef,
          avatar: "",
          isActive: false,
          isBanned: false,
          role: "USER",
        },
      });
      await syncSeedUserEmail(seedId, row.email);
      resolved.set(userRef, seedId);
      continue;
    }

    throw new Error(`Users sheet: unsupported mode for ${userRef}: ${row.mode}`);
  }

  return resolved;
}

async function importRatingItems(rows) {
  for (const row of rows) {
    const id = sanitizeText(row.id);
    const category = parseCategory(row.category);
    const name = sanitizeText(row.name);
    const department = sanitizeText(row.department) || "Unknown";

    if (!id || !name) {
      throw new Error(`RatingItems sheet: id and name are required. Row id=${row.id}`);
    }

    await prisma.ratingItem.upsert({
      where: { id },
      update: {
        category,
        name,
        department,
        code: toOptionalString(row.code),
        email: toOptionalString(row.email),
        location: toOptionalString(row.location),
        avatar: toOptionalString(row.avatar),
      },
      create: {
        id,
        category,
        name,
        department,
        code: toOptionalString(row.code),
        email: toOptionalString(row.email),
        location: toOptionalString(row.location),
        avatar: toOptionalString(row.avatar),
      },
    });
  }
}

async function importScoreDimensions(rows) {
  for (const row of rows) {
    const category = parseCategory(row.category);
    const name = sanitizeText(row.name);
    if (!name) {
      throw new Error("ScoreDimensions sheet: name is required");
    }

    const label = {
      tc: sanitizeText(row.label_tc),
      sc: sanitizeText(row.label_sc),
      en: sanitizeText(row.label_en),
      left_tc: sanitizeText(row.left_tc),
      left_sc: sanitizeText(row.left_sc),
      left_en: sanitizeText(row.left_en),
      right_tc: sanitizeText(row.right_tc),
      right_sc: sanitizeText(row.right_sc),
      right_en: sanitizeText(row.right_en),
      left: sanitizeText(row.left_en),
      right: sanitizeText(row.right_en),
    };

    await prisma.scoreDimension.upsert({
      where: {
        category_name: {
          category,
          name,
        },
      },
      update: {
        label,
        order: Number(row.order) || 0,
      },
      create: {
        category,
        name,
        label,
        order: Number(row.order) || 0,
      },
    });
  }
}

function buildScores(row) {
  const pairs = [
    [row.score_1_key, row.score_1_value],
    [row.score_2_key, row.score_2_value],
    [row.score_3_key, row.score_3_value],
  ];

  const scores = {};
  for (const [keyRaw, valueRaw] of pairs) {
    const key = sanitizeText(keyRaw);
    if (!key) continue;
    scores[key] = toScoreValue(valueRaw);
  }
  if (Object.keys(scores).length === 0) {
    throw new Error(`Ratings sheet: at least one score is required for item ${row.item_id}`);
  }
  return scores;
}

async function validateRatingDimensions(category, scores) {
  const dimensions = await prisma.scoreDimension.findMany({
    where: { category },
    select: { name: true },
  });
  const validKeys = new Set(dimensions.map((dimension) => dimension.name));
  for (const key of Object.keys(scores)) {
    if (!validKeys.has(key)) {
      throw new Error(`Ratings sheet: score key "${key}" is not defined for ${category}`);
    }
  }
}

async function replaceImportedRatingsByCategories(categories) {
  const uniqueCategories = Array.from(new Set(categories));
  if (uniqueCategories.length === 0) return;

  await prisma.rating.deleteMany({
    where: {
      item: { category: { in: uniqueCategories } },
      userId: { startsWith: "import-rater-" },
    },
  });
}

async function importRatings(rows, userMap, mode) {
  const seenCompositeKeys = new Set();
  const categoriesForReplace = [];

  if (mode === "replace_by_category") {
    for (const row of rows) {
      categoriesForReplace.push(parseCategory(row.category));
    }
    await replaceImportedRatingsByCategories(categoriesForReplace);
  }

  for (const row of rows) {
    const itemId = sanitizeText(row.item_id);
    const category = parseCategory(row.category);
    const userRef = sanitizeText(row.user_ref);
    const semester = toOptionalString(row.semester);
    const comment = toOptionalString(row.comment);
    const createdAt = parseDateOrNull(row.created_at);
    const updatedAt = parseDateOrNull(row.updated_at);
    const tags = parseTags(row.tags);
    const scores = buildScores(row);

    if (!itemId || !userRef) {
      throw new Error("Ratings sheet: item_id and user_ref are required");
    }

    const item = await prisma.ratingItem.findUnique({
      where: { id: itemId },
      select: { id: true, category: true },
    });
    if (!item) {
      throw new Error(`Ratings sheet: item not found: ${itemId}`);
    }
    if (item.category !== category) {
      throw new Error(`Ratings sheet: category mismatch for ${itemId}. Expected ${item.category}, got ${category}`);
    }

    const userId = userMap.get(userRef);
    if (!userId) {
      throw new Error(`Ratings sheet: user_ref not found in Users sheet: ${userRef}`);
    }

    await validateRatingDimensions(category, scores);

    const compositeKey = `${itemId}:${userRef}:${semester ?? ""}`;
    if (seenCompositeKeys.has(compositeKey)) {
      throw new Error(`Ratings sheet: duplicate (item_id, user_ref, semester): ${compositeKey}`);
    }
    seenCompositeKeys.add(compositeKey);

    const existing = await prisma.rating.findFirst({
      where: { itemId, userId, ...(semester ? { semester } : { semester: null }) },
      select: { id: true },
    });

    const createData = {
      itemId,
      userId,
      semester,
      scores,
      tags,
      comment,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };

    if (existing) {
      await prisma.rating.update({
        where: { id: existing.id },
        data: {
          semester,
          scores,
          tags,
          comment,
          ...(updatedAt ? { updatedAt } : {}),
        },
      });
    } else {
      await prisma.rating.create({ data: createData });
    }
  }
}

function summarize(rows) {
  const categories = Array.from(
    new Set(rows.ratings.map((row) => sanitizeText(row.category).toUpperCase()).filter(Boolean))
  );

  return {
    ratingItems: rows.ratingItems.length,
    scoreDimensions: rows.scoreDimensions.length,
    users: rows.users.length,
    ratings: rows.ratings.length,
    categories,
  };
}

async function main() {
  const { filePath, execute, mode } = parseArgs();
  const workbook = XLSX.readFile(filePath);

  const ratingItems = loadSheet(workbook, "RatingItems");
  const scoreDimensions = loadSheet(workbook, "ScoreDimensions");
  const users = loadSheet(workbook, "Users");
  const ratings = loadSheet(workbook, "Ratings");

  const summary = summarize({ ratingItems, scoreDimensions, users, ratings });
  console.log(JSON.stringify({ filePath, mode, execute, summary }, null, 2));

  if (!execute) {
    console.log("\nDry run only. Re-run with --execute to import workbook data.");
    return;
  }

  await importRatingItems(ratingItems);
  await importScoreDimensions(scoreDimensions);
  const userMap = await resolveUsers(users);
  await importRatings(ratings, userMap, mode);

  console.log("\nImport completed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
