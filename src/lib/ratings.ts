import { RatingCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { NotFoundError, ValidationError } from "@/src/lib/errors";

type RatingDimensionFixture = {
  key: string;
  label: string;
  left: string;
  right: string;
};

type RatingSummary = {
  id: string;
  category: RatingCategory;
  name: string;
  department: string;
  code?: string | null;
  email?: string | null;
  location?: string | null;
  avatar?: string | null;
  scores: Array<{ key: string; label: string; value: number }>;
  tags: string[];
  tagCounts: Record<string, number>;
  ratingCount: number;
  recentCount: number;
  scoreVariance: number;
};

const DIMENSION_FIXTURES: Record<RatingCategory, RatingDimensionFixture[]> = {
  [RatingCategory.TEACHER]: [
    { key: "teaching", label: "Teaching Skill", left: "Boring", right: "Engaging" },
    { key: "grading", label: "Grading", left: "Harsh", right: "Generous" },
    { key: "accessibility", label: "Accessibility", left: "Hard to Reach", right: "Always Available" },
  ],
  [RatingCategory.COURSE]: [
    { key: "grading", label: "Grading", left: "Harsh", right: "Generous" },
    { key: "exam", label: "Exam Difficulty", left: "Difficult", right: "Easy" },
    { key: "workload", label: "Workload", left: "Heavy", right: "Light" },
  ],
  [RatingCategory.CANTEEN]: [
    { key: "taste", label: "Taste", left: "Bad", right: "Delicious" },
    { key: "value", label: "Value", left: "Pricey", right: "Great Value" },
    { key: "cleanliness", label: "Cleanliness", left: "Dirty", right: "Clean" },
  ],
  [RatingCategory.MAJOR]: [
    { key: "career", label: "Career Prospect", left: "Bleak", right: "Bright" },
    { key: "curriculum", label: "Curriculum", left: "Average", right: "Excellent" },
    { key: "satisfaction", label: "Satisfaction", left: "Unsatisfied", right: "Satisfied" },
  ],
};

// Rating item data (courses, teachers, canteens, majors) lives in the database only.
// Seed fixtures were removed — the DB is the single source of truth.

function parseCategory(input: string): RatingCategory {
  const normalized = (input ?? "").trim().toUpperCase();
  if (!Object.values(RatingCategory).includes(normalized as RatingCategory)) {
    throw new ValidationError("Unsupported rating category");
  }
  return normalized as RatingCategory;
}

function sanitizeText(value: string | null | undefined, fallback = ""): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function parseScoreRecord(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(numeric)) {
      result[key] = Math.max(0, Math.min(5, numeric));
    }
  }
  return result;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return roundToTwo(Math.sqrt(variance));
}

let _dimensionsInitialized = false;
let _dimensionsInitPromise: Promise<void> | null = null;

const DIMENSION_SEED_VERSION = "v9"; // v9: removed item seed fixtures, DB is source of truth

async function ensureDimensions() {
  if (_dimensionsInitialized) return;
  if (_dimensionsInitPromise) {
    await _dimensionsInitPromise;
    return;
  }

  _dimensionsInitPromise = (async () => {
    try {
      const done = await redis.get("rating:dim:done");
      if (done === DIMENSION_SEED_VERSION) {
        _dimensionsInitialized = true;
        return;
      }
    } catch {
      // Redis down — fall through
    }

    await prisma.$transaction(async (tx) => {
      const validDimensionKeys = Object.entries(DIMENSION_FIXTURES).flatMap(([category, dimensions]) =>
        dimensions.map((d) => ({ category: category as RatingCategory, name: d.key }))
      );
      const allCategories = Object.keys(DIMENSION_FIXTURES) as RatingCategory[];
      await tx.scoreDimension.deleteMany({
        where: {
          OR: allCategories.map((cat) => ({
            category: cat,
            name: { notIn: validDimensionKeys.filter((k) => k.category === cat).map((k) => k.name) },
          })),
        },
      });

      await Promise.all(
        Object.entries(DIMENSION_FIXTURES).flatMap(([category, dimensions]) =>
          dimensions.map((dimension, index) =>
            tx.scoreDimension.upsert({
              where: {
                category_name: {
                  category: category as RatingCategory,
                  name: dimension.key,
                },
              },
              update: {
                label: { tc: dimension.label, sc: dimension.label, en: dimension.label, left: dimension.left, right: dimension.right },
                order: index,
              },
              create: {
                category: category as RatingCategory,
                name: dimension.key,
                label: { tc: dimension.label, sc: dimension.label, en: dimension.label, left: dimension.left, right: dimension.right },
                order: index,
              },
            })
          )
        )
      );
    }, { timeout: 30000 });

    _dimensionsInitialized = true;
    try {
      await redis.set("rating:dim:done", DIMENSION_SEED_VERSION, "EX", 86400);
    } catch {}
  })();

  await _dimensionsInitPromise;
}

/** @deprecated Use ensureDimensions() — kept for backward compat */
export const ensureRatingSeedData = ensureDimensions;

export async function getRatingDimensions(categoryInput: string) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();
  const dimensions = await prisma.scoreDimension.findMany({
    where: { category },
    orderBy: { order: "asc" },
  });

  return dimensions.map((dimension) => ({
    name: dimension.name,
    label: dimension.label,
    order: dimension.order,
  }));
}

function buildTagOptions(ratings: Array<{ tags: string[] }>): string[] {
  const ratingTags = ratings.flatMap((rating) => rating.tags ?? []);
  return Array.from(new Set(ratingTags)).filter(Boolean);
}

// Predefined tag options per category — keys must match ratingTranslations.ts in frontend
const DEFAULT_TAGS: Record<RatingCategory, string[]> = {
  TEACHER: ['#Great Prof', '#Recorded Lectures', '#Easy Exams', '#Beginner Friendly', '#Recommended', '#Flexible Deadline', '#Less HW', '#Final Exam'],
  COURSE: ['#Practical', '#Interesting', '#Group Project', '#Good Grades', '#Easy Exams', '#Recommended', '#Less HW', '#Beginner Friendly'],
  CANTEEN: ['#Big Portions', '#Many Options', '#Long Queue', '#Good Chinese Food', '#Nice Environment', '#A Bit Pricey', '#Good Value', '#Recommended'],
  MAJOR: ['#High Employment', '#Many Internships', '#Good Facilities', '#Creative Freedom', '#Hands-on', '#Exchange Opps', '#Interesting', '#Recommended'],
};

export async function getRatingTagOptions(categoryInput: string) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();
  const items = await prisma.ratingItem.findMany({
    where: { category },
    select: {
      ratings: {
        select: {
          tags: true,
        },
      },
    },
  });

  const userTags = buildTagOptions(items.flatMap((item) => item.ratings));
  // Merge user-submitted tags with defaults, deduplicated
  const defaults = DEFAULT_TAGS[category] || [];
  return Array.from(new Set([...userTags, ...defaults]));
}

function buildSummaryFromItem(
  item: {
    id: string;
    category: RatingCategory;
    name: string;
    department: string;
    code: string | null;
    email: string | null;
    location: string | null;
    avatar: string | null;
    ratings: Array<{
      createdAt: Date;
      scores: Prisma.JsonValue;
      tags: string[];
    }>;
  },
  dimensions: Array<{ name: string; label: Prisma.JsonValue }>
): RatingSummary {
  const safeName = sanitizeText(item.name, sanitizeText(item.code, sanitizeText(item.email, "Untitled")));
  const safeDepartment = sanitizeText(item.department, sanitizeText(item.location, "Unknown"));
  const actualRatings = item.ratings ?? [];

  let tagCounts: Record<string, number> = {};
  let ratingCount = 0;
  let recentCount = 0;
  let scoreVariance = 0;
  let scoreValues: Record<string, number> = {};

  if (actualRatings.length > 0) {
    ratingCount = actualRatings.length;
    recentCount = actualRatings.filter((rating) => rating.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;

    const scoreRecords = actualRatings.map((rating) => parseScoreRecord(rating.scores));
    const perRatingOverall = scoreRecords.map((record) => {
      const values = Object.values(record);
      if (values.length === 0) return 0;
      return (values.reduce((sum, value) => sum + value, 0) / values.length) * 20;
    });
    scoreVariance = computeStdDev(perRatingOverall);

    const aggregate: Record<string, { total: number; count: number }> = {};
    for (const record of scoreRecords) {
      for (const [key, value] of Object.entries(record)) {
        aggregate[key] ??= { total: 0, count: 0 };
        aggregate[key].total += value;
        aggregate[key].count += 1;
      }
    }
    for (const [key, value] of Object.entries(aggregate)) {
      scoreValues[key] = roundToTwo(value.total / value.count);
    }

    for (const rating of actualRatings) {
      for (const tag of rating.tags ?? []) {
        const normalizedTag = sanitizeText(tag);
        if (!normalizedTag) continue;
        tagCounts[normalizedTag] = (tagCounts[normalizedTag] ?? 0) + 1;
      }
    }
  }

  const scores = dimensions.map((dimension) => {
    // dimension.label can be a JSON object {tc,sc,en} or a plain string from DIMENSION_FIXTURES
    const rawLabel = dimension.label;
    let label: string;
    if (typeof rawLabel === "string") {
      label = rawLabel;
    } else if (rawLabel && typeof rawLabel === "object") {
      const labelObj = rawLabel as Record<string, unknown>;
      // Try to extract a string label, prefer the fixture label field
      label = (typeof labelObj.en === "string" && labelObj.en.trim()) ? labelObj.en
        : (typeof labelObj.tc === "string" && labelObj.tc.trim()) ? labelObj.tc as string
        : dimension.name;
    } else {
      label = dimension.name;
    }
    return {
      key: dimension.name,
      label,
      value: roundToTwo((scoreValues[dimension.name] ?? 0) * 20),
    };
  });

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  return {
    id: item.id,
    category: item.category,
    name: safeName,
    department: safeDepartment,
    code: item.code,
    email: item.email,
    location: item.location,
    avatar: item.avatar,
    scores,
    tags: sortedTags,
    tagCounts,
    ratingCount,
    recentCount,
    scoreVariance,
  };
}

export async function getRatingList(categoryInput: string, sortMode: string | null) {
  const category = parseCategory(categoryInput);
  const effectiveSort = sortMode ?? "recent";
  const cacheKey = `rating:list:${category}:${effectiveSort}`;

  // Check Redis cache first (2 min TTL)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis down — fall through to DB
  }

  await ensureRatingSeedData();

  const [items, dimensions] = await Promise.all([
    prisma.ratingItem.findMany({
      where: { category },
      include: {
        ratings: {
          select: {
            createdAt: true,
            scores: true,
            tags: true,
          },
        },
      },
    }),
    prisma.scoreDimension.findMany({
      where: { category },
      orderBy: { order: "asc" },
      select: {
        name: true,
        label: true,
      },
    }),
  ]);

  const summaries = items
    .map((item) => buildSummaryFromItem(item, dimensions))
    .filter((item) => sanitizeText(item.name).length > 0);

  if (effectiveSort === "controversial") {
    summaries.sort((a, b) => b.scoreVariance - a.scoreVariance || b.ratingCount - a.ratingCount || (a.code ?? a.name).localeCompare(b.code ?? b.name));
  } else {
    // Default: items with ratings first (by count desc), then unrated alphabetically
    summaries.sort((a, b) => {
      const aHas = a.ratingCount > 0 ? 0 : 1;
      const bHas = b.ratingCount > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount;
      return a.name.localeCompare(b.name);
    });
  }

  // Cache result for 10 minutes
  try {
    await redis.set(cacheKey, JSON.stringify(summaries), "EX", 600);
  } catch {
    // Redis down — continue without cache
  }

  return summaries;
}

export async function getRatingDetail(categoryInput: string, id: string) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();

  const [item, dimensions] = await Promise.all([
    prisma.ratingItem.findFirst({
      where: {
        id,
        category,
      },
      include: {
        ratings: {
          select: {
            createdAt: true,
            scores: true,
            tags: true,
            comment: true,
          },
        },
      },
    }),
    prisma.scoreDimension.findMany({
      where: { category },
      orderBy: { order: "asc" },
      select: {
        name: true,
        label: true,
      },
    }),
  ]);

  if (!item) {
    throw new NotFoundError("Rating item not found");
  }

  const summary = buildSummaryFromItem(item, dimensions);

  // Collect anonymous comments (no user info exposed)
  const comments = item.ratings
    .filter((r) => r.comment && r.comment.trim().length > 0)
    .map((r) => ({
      comment: r.comment!,
      createdAt: r.createdAt.toISOString(),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { ...summary, comments };
}

/**
 * Get the current user's rating for a specific item (if any).
 * Returns null if the user hasn't rated this item.
 */
export async function getMyRating(
  userId: string,
  categoryInput: string,
  id: string,
) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();

  const rating = await prisma.rating.findFirst({
    where: {
      itemId: id,
      userId,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      scores: true,
      tags: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!rating) return null;

  return {
    id: rating.id,
    scores: rating.scores as Record<string, number>,
    tags: rating.tags,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
    updatedAt: rating.updatedAt.toISOString(),
  };
}

export async function submitRatingForItem(
  userId: string,
  categoryInput: string,
  id: string,
  payload: {
    scores: Record<string, number>;
    tags: string[];
    comment?: string;
    semester?: string;
  }
) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();

  const item = await prisma.ratingItem.findFirst({
    where: { id, category },
    select: { id: true },
  });

  if (!item) {
    throw new NotFoundError("Rating item not found");
  }

  const semester = sanitizeText(payload.semester) || null;
  const existing = await prisma.rating.findFirst({
    where: {
      itemId: id,
      userId,
      ...(semester ? { semester } : { semester: null }),
    },
    select: { id: true },
  });

  const normalizedScores = Object.entries(payload.scores ?? {}).reduce<Record<string, number>>((acc, [key, value]) => {
    if (!key) return acc;
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      acc[key] = Math.max(0, Math.min(5, numeric));
    }
    return acc;
  }, {});

  const normalizedTags = Array.from(
    new Set((payload.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))
  ).slice(0, 10);

  if (existing) {
    await prisma.rating.update({
      where: { id: existing.id },
      data: {
        scores: normalizedScores,
        tags: normalizedTags,
        comment: sanitizeText(payload.comment) || null,
        semester,
      },
    });
  } else {
    await prisma.rating.create({
      data: {
        itemId: id,
        userId,
        scores: normalizedScores,
        tags: normalizedTags,
        comment: sanitizeText(payload.comment) || null,
        semester,
      },
    });
  }

  // Invalidate Redis cache so updated scores show immediately
  try {
    const knownSortModes = ["recent", "controversial"];
    await redis.del(...knownSortModes.map((mode) => `rating:list:${category}:${mode}`));
  } catch {
    // Redis down — cache will expire naturally (10 min TTL)
  }

  return { success: true };
}
