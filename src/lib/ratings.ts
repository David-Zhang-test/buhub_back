import { RatingCategory, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { NotFoundError, ValidationError } from "@/src/lib/errors";
import { child } from "@/src/lib/logger";

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
  scores: Array<{ key: string; label: string | Record<string, unknown>; value: number }>;
  tags: string[];
  tagCounts: Record<string, number>;
  overallScore: number;
  ratingCount: number;
  recentCount: number;
  scoreVariance: number;
};

type PaginatedRatingList = {
  items: RatingSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

type RatingCommentRow = {
  id: string;
  comment: string;
  createdAt: Date;
};

type RatingItemListRecord = {
  id: string;
  category: RatingCategory;
  name: string;
  department: string;
  code: string | null;
  email: string | null;
  location: string | null;
  avatar: string | null;
};

type RatingAggregateRow = {
  itemId: string;
  ratingCount: number | bigint | Prisma.Decimal;
  recentCount: number | bigint | Prisma.Decimal;
  scoreVariance: number | bigint | Prisma.Decimal | null;
};

type RatingDimensionAverageRow = {
  itemId: string;
  dimension: string;
  value: number | bigint | Prisma.Decimal;
};

type RatingTagCountRow = {
  itemId: string;
  tag: string;
  count: number | bigint | Prisma.Decimal;
};

type RatingListPageRow = RatingItemListRecord & {
  ratingCount: number | bigint | Prisma.Decimal;
  recentCount: number | bigint | Prisma.Decimal;
  scoreVariance: number | bigint | Prisma.Decimal | null;
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

const DETAIL_COMMENTS_PAGE_SIZE = 10;
const DETAIL_CACHE_TTL_SECONDS = 300;
const LIST_PAGE_SIZE = 20;
const log = child("ratings");

function getRatingListCacheKey(category: RatingCategory, sortMode: string, query: string, page: number, limit: number) {
  const encodedQuery = encodeURIComponent(query.trim().toLowerCase());
  return `rating:list:${category}:${sortMode}:q=${encodedQuery}:page=${page}:limit=${limit}`;
}

function getRatingListCachePattern(category: RatingCategory) {
  return `rating:list:${category}:*`;
}

function getRatingTagsCacheKey(category: RatingCategory) {
  return `rating:tags:${category}`;
}

function getRatingDetailCacheKey(category: RatingCategory, id: string) {
  return `rating:detail:${category}:${id}`;
}

function sqlRatingCategory(category: RatingCategory) {
  return Prisma.sql`CAST(${category} AS "RatingCategory")`;
}

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

function normalizePaginationNumber(value: string | null | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

// Score scale conversion helpers.
//
// The mobile form collects scores on a 0..100 scale. Storage uses 0..5 to keep
// historical rows untouched (their aggregate read still ×20 to display 0..100).
// `convertSubmittedScoreTo05` is the single ingest boundary; aggregate reads
// (SQL or JS) mirror `aggregateDimensionDisplay` to render the 0..100 number.
export function convertSubmittedScoreTo05(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, value / 20));
}

export function aggregateDimensionDisplay(storedValues: number[]): number {
  if (storedValues.length === 0) return 0;
  const avg = storedValues.reduce((sum, v) => sum + v, 0) / storedValues.length;
  return Math.round(avg * 20 * 100) / 100;
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

function toNumber(value: number | bigint | Prisma.Decimal | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return 0;
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
  })().catch((err) => {
    _dimensionsInitPromise = null;
    throw err;
  });

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
  const cacheKey = getRatingTagsCacheKey(category);
  const startedAt = Date.now();

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        log.debug("tag options cache hit", {
          category,
          count: parsed.length,
          durationMs: Date.now() - startedAt,
        });
        return parsed.filter((tag): tag is string => typeof tag === "string");
      }
    }
  } catch {
    // Redis down — fall through to DB
  }

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
  const mergedTags = Array.from(new Set([...userTags, ...defaults]));

  try {
    await redis.set(cacheKey, JSON.stringify(mergedTags), "EX", 3600);
  } catch {
    // Redis down — continue without cache
  }

  log.debug("tag options cache miss", {
    category,
    count: mergedTags.length,
    durationMs: Date.now() - startedAt,
  });

  return mergedTags;
}

function buildRatingSearchClause(query: string) {
  const trimmed = sanitizeText(query);
  if (!trimmed) {
    return Prisma.empty;
  }

  const pattern = `%${trimmed}%`;
  return Prisma.sql`
    AND (
      item.name ILIKE ${pattern}
      OR item.department ILIKE ${pattern}
      OR COALESCE(item.code, '') ILIKE ${pattern}
      OR COALESCE(item.email, '') ILIKE ${pattern}
      OR COALESCE(item.location, '') ILIKE ${pattern}
    )
  `;
}

function getRatingListOrderClause(sortMode: string) {
  if (sortMode === "controversial") {
    return Prisma.sql`
      ORDER BY
        COALESCE(aggregated."scoreVariance", 0) DESC,
        COALESCE(aggregated."ratingCount", 0) DESC,
        COALESCE(NULLIF(item.code, ''), item.name) ASC,
        item.id ASC
    `;
  }

  return Prisma.sql`
    ORDER BY
      CASE WHEN COALESCE(aggregated."ratingCount", 0) > 0 THEN 0 ELSE 1 END ASC,
      COALESCE(aggregated."ratingCount", 0) DESC,
      item.name ASC,
      item.id ASC
  `;
}

function buildScoreEntries(
  dimensions: Array<{ name: string; label: Prisma.JsonValue }>,
  scoreValues: Record<string, number>
) {
  return dimensions.map((dimension) => {
    const rawLabel = dimension.label;
    let label: string | Record<string, unknown>;
    if (rawLabel && typeof rawLabel === "object" && !Array.isArray(rawLabel)) {
      label = rawLabel as Record<string, unknown>;
    } else if (typeof rawLabel === "string") {
      label = rawLabel;
    } else {
      label = dimension.name;
    }
    return {
      key: dimension.name,
      label,
      value: roundToTwo(scoreValues[dimension.name] ?? 0),
    };
  });
}

function buildSummaryFromListAggregates(
  item: RatingItemListRecord,
  dimensions: Array<{ name: string; label: Prisma.JsonValue }>,
  aggregateByItemId: Map<string, { ratingCount: number; recentCount: number; scoreVariance: number }>,
  scoreValuesByItemId: Map<string, Record<string, number>>,
  tagCountsByItemId: Map<string, Record<string, number>>
): RatingSummary {
  const safeName = sanitizeText(item.name, sanitizeText(item.code, sanitizeText(item.email, "Untitled")));
  const safeDepartment = sanitizeText(item.department, sanitizeText(item.location, "Unknown"));
  const aggregate = aggregateByItemId.get(item.id);
  const scoreValues = scoreValuesByItemId.get(item.id) ?? {};
  const tagCounts = tagCountsByItemId.get(item.id) ?? {};
  const scores = buildScoreEntries(dimensions, scoreValues);
  const sortedTagEntries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const topTags = sortedTagEntries.slice(0, 3).map(([tag]) => tag);
  const topTagCounts: Record<string, number> = {};

  for (const [tag, count] of sortedTagEntries.slice(0, 3)) {
    topTagCounts[tag] = count;
  }

  const overallScore = scores.length > 0
    ? roundToTwo(scores.reduce((sum, score) => sum + score.value, 0) / scores.length)
    : 0;

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
    tags: topTags,
    tagCounts: topTagCounts,
    overallScore,
    ratingCount: aggregate?.ratingCount ?? 0,
    recentCount: aggregate?.recentCount ?? 0,
    scoreVariance: aggregate?.scoreVariance ?? 0,
  };
}

async function getRatingItemBase(category: RatingCategory, id: string) {
  return prisma.ratingItem.findFirst({
    where: { id, category },
    select: {
      id: true,
      category: true,
      name: true,
      department: true,
      code: true,
      email: true,
      location: true,
      avatar: true,
    },
  });
}

async function getRatingAggregateForItem(category: RatingCategory, id: string) {
  const rows = await prisma.$queryRaw<RatingAggregateRow[]>(Prisma.sql`
    WITH rating_base AS (
      SELECT
        r."itemId",
        r."createdAt",
        COALESCE(AVG((entry.value)::numeric), 0) AS overall_score
      FROM "Rating" r
      INNER JOIN "RatingItem" item ON item.id = r."itemId"
      LEFT JOIN LATERAL jsonb_each_text(r.scores::jsonb) AS entry(key, value) ON TRUE
      WHERE item.category = ${sqlRatingCategory(category)} AND r."itemId" = ${id}
      GROUP BY r.id, r."itemId", r."createdAt"
    )
    SELECT
      "itemId",
      COUNT(*)::int AS "ratingCount",
      COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days')::int AS "recentCount",
      COALESCE(ROUND((STDDEV_POP(overall_score) * 20)::numeric, 2), 0)::double precision AS "scoreVariance"
    FROM rating_base
    GROUP BY "itemId"
  `);

  const row = rows[0];
  return row
    ? {
        ratingCount: toNumber(row.ratingCount),
        recentCount: toNumber(row.recentCount),
        scoreVariance: roundToTwo(toNumber(row.scoreVariance)),
      }
    : { ratingCount: 0, recentCount: 0, scoreVariance: 0 };
}

async function getRatingDimensionAveragesForItem(category: RatingCategory, id: string) {
  const rows = await prisma.$queryRaw<RatingDimensionAverageRow[]>(Prisma.sql`
    SELECT
      r."itemId",
      entry.key AS dimension,
      ROUND((AVG((entry.value)::numeric) * 20)::numeric, 2)::double precision AS value
    FROM "Rating" r
    INNER JOIN "RatingItem" item ON item.id = r."itemId"
    CROSS JOIN LATERAL jsonb_each_text(r.scores::jsonb) AS entry(key, value)
    WHERE item.category = ${sqlRatingCategory(category)} AND r."itemId" = ${id}
    GROUP BY r."itemId", entry.key
  `);

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.dimension] = roundToTwo(toNumber(row.value));
    return acc;
  }, {});
}

async function getRatingTopTagCountsForItem(category: RatingCategory, id: string) {
  const rows = await prisma.$queryRaw<RatingTagCountRow[]>(Prisma.sql`
    SELECT
      ranked."itemId",
      ranked.tag,
      ranked.count
    FROM (
      SELECT
        r."itemId",
        BTRIM(tag_value.tag) AS tag,
        COUNT(*)::int AS count,
        ROW_NUMBER() OVER (
          PARTITION BY r."itemId"
          ORDER BY COUNT(*) DESC, BTRIM(tag_value.tag) ASC
        ) AS rank
      FROM "Rating" r
      INNER JOIN "RatingItem" item ON item.id = r."itemId"
      CROSS JOIN LATERAL unnest(r.tags) AS tag_value(tag)
      WHERE item.category = ${sqlRatingCategory(category)} AND r."itemId" = ${id} AND BTRIM(tag_value.tag) <> ''
      GROUP BY r."itemId", BTRIM(tag_value.tag)
    ) AS ranked
    WHERE ranked.rank <= 3
  `);

  return rows.reduce<Record<string, number>>((acc, row) => {
    const tag = sanitizeText(row.tag);
    if (!tag) return acc;
    acc[tag] = toNumber(row.count);
    return acc;
  }, {});
}

export async function getRatingCommentsPage(
  categoryInput: string,
  id: string,
  page = 1,
  limit = DETAIL_COMMENTS_PAGE_SIZE
) {
  const category = parseCategory(categoryInput);
  const normalizedPage = Math.max(1, Math.floor(page) || 1);
  const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit) || DETAIL_COMMENTS_PAGE_SIZE));
  const startedAt = Date.now();

  const item = await getRatingItemBase(category, id);
  if (!item) {
    throw new NotFoundError("Rating item not found");
  }

  const offset = (normalizedPage - 1) * normalizedLimit;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<RatingCommentRow[]>(Prisma.sql`
      SELECT
        r.id,
        r.comment,
        r."createdAt"
      FROM "Rating" r
      WHERE r."itemId" = ${id}
        AND r.comment IS NOT NULL
        AND BTRIM(r.comment) <> ''
      ORDER BY r."createdAt" DESC, r.id DESC
      LIMIT ${normalizedLimit}
      OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: number | bigint | Prisma.Decimal }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "Rating" r
      WHERE r."itemId" = ${id}
        AND r.comment IS NOT NULL
        AND BTRIM(r.comment) <> ''
    `),
  ]);

  const total = toNumber(countRows[0]?.count);
  const comments = rows.map((row) => ({
    id: row.id,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  }));

  const payload = {
    data: comments,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    hasMore: offset + comments.length < total,
  };

  log.debug("comments page", {
    category,
    itemId: id,
    page: normalizedPage,
    limit: normalizedLimit,
    returned: comments.length,
    total,
    durationMs: Date.now() - startedAt,
  });

  return payload;
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

  const scores = buildScoreEntries(
    dimensions,
    Object.entries(scoreValues).reduce<Record<string, number>>((acc, [key, value]) => {
      acc[key] = value * 20;
      return acc;
    }, {})
  );

  const sortedTagEntries = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1]);
  const topTags = sortedTagEntries.slice(0, 3).map(([tag]) => tag);
  const topTagCounts: Record<string, number> = {};
  for (const [tag, count] of sortedTagEntries.slice(0, 3)) {
    topTagCounts[tag] = count;
  }

  const overallScore = scores.length > 0
    ? roundToTwo(scores.reduce((sum, s) => sum + s.value, 0) / scores.length)
    : 0;

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
    tags: topTags,
    tagCounts: topTagCounts,
    overallScore,
    ratingCount,
    recentCount,
    scoreVariance,
  };
}

export async function getRatingList(
  categoryInput: string,
  sortMode: string | null,
  options?: {
    page?: number;
    limit?: number;
    query?: string | null;
  }
): Promise<PaginatedRatingList> {
  const category = parseCategory(categoryInput);
  const effectiveSort = sortMode ?? "recent";
  const query = sanitizeText(options?.query);
  const page = normalizePaginationNumber(String(options?.page ?? ""), 1, 1, 9999);
  const limit = normalizePaginationNumber(String(options?.limit ?? ""), LIST_PAGE_SIZE, 1, 50);
  const offset = (page - 1) * limit;
  const cacheKey = getRatingListCacheKey(category, effectiveSort, query, page, limit);
  const startedAt = Date.now();

  // Check Redis cache first (10 min TTL)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      log.info("list cache hit", {
        category,
        sortMode: effectiveSort,
        page,
        limit,
        query,
        count: Array.isArray(parsed?.items) ? parsed.items.length : 0,
        durationMs: Date.now() - startedAt,
      });
      return parsed;
    }
  } catch {
    // Redis down — fall through to DB
  }

  await ensureRatingSeedData();

  const searchClause = buildRatingSearchClause(query);
  const orderClause = getRatingListOrderClause(effectiveSort);

  const [items, totalRows, dimensions] = await Promise.all([
    prisma.$queryRaw<RatingListPageRow[]>(Prisma.sql`
      WITH filtered_items AS (
        SELECT
          item.id,
          item.category,
          item.name,
          item.department,
          item.code,
          item.email,
          item.location,
          item.avatar
        FROM "RatingItem" item
        WHERE item.category = ${sqlRatingCategory(category)}
        ${searchClause}
      ),
      rating_base AS (
        SELECT
          r."itemId",
          r."createdAt",
          COALESCE(AVG((entry.value)::numeric), 0) AS overall_score
        FROM "Rating" r
        INNER JOIN filtered_items item ON item.id = r."itemId"
        LEFT JOIN LATERAL jsonb_each_text(r.scores::jsonb) AS entry(key, value) ON TRUE
        GROUP BY r.id, r."itemId", r."createdAt"
      ),
      aggregated AS (
        SELECT
          "itemId",
          COUNT(*)::int AS "ratingCount",
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days')::int AS "recentCount",
          COALESCE(ROUND((STDDEV_POP(overall_score) * 20)::numeric, 2), 0)::double precision AS "scoreVariance"
        FROM rating_base
        GROUP BY "itemId"
      )
      SELECT
        item.id,
        item.category,
        item.name,
        item.department,
        item.code,
        item.email,
        item.location,
        item.avatar,
        COALESCE(aggregated."ratingCount", 0)::int AS "ratingCount",
        COALESCE(aggregated."recentCount", 0)::int AS "recentCount",
        COALESCE(aggregated."scoreVariance", 0)::double precision AS "scoreVariance"
      FROM filtered_items item
      LEFT JOIN aggregated ON aggregated."itemId" = item.id
      ${orderClause}
      LIMIT ${limit}
      OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: number | bigint | Prisma.Decimal }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "RatingItem" item
      WHERE item.category = ${sqlRatingCategory(category)}
      ${searchClause}
    `),
    prisma.scoreDimension.findMany({
      where: { category },
      orderBy: { order: "asc" },
      select: {
        name: true,
        label: true,
      },
    }),
  ]);

  const total = toNumber(totalRows[0]?.count);
  const itemIds = items.map((item) => item.id);

  const [dimensionAverages, tagCounts] = itemIds.length > 0
    ? await Promise.all([
        prisma.$queryRaw<RatingDimensionAverageRow[]>(Prisma.sql`
          SELECT
            r."itemId",
            entry.key AS dimension,
            ROUND((AVG((entry.value)::numeric) * 20)::numeric, 2)::double precision AS value
          FROM "Rating" r
          CROSS JOIN LATERAL jsonb_each_text(r.scores::jsonb) AS entry(key, value)
          WHERE r."itemId" IN (${Prisma.join(itemIds)})
          GROUP BY r."itemId", entry.key
        `),
        prisma.$queryRaw<RatingTagCountRow[]>(Prisma.sql`
          SELECT
            ranked."itemId",
            ranked.tag,
            ranked.count
          FROM (
            SELECT
              r."itemId",
              BTRIM(tag_value.tag) AS tag,
              COUNT(*)::int AS count,
              ROW_NUMBER() OVER (
                PARTITION BY r."itemId"
                ORDER BY COUNT(*) DESC, BTRIM(tag_value.tag) ASC
              ) AS rank
            FROM "Rating" r
            CROSS JOIN LATERAL unnest(r.tags) AS tag_value(tag)
            WHERE r."itemId" IN (${Prisma.join(itemIds)}) AND BTRIM(tag_value.tag) <> ''
            GROUP BY r."itemId", BTRIM(tag_value.tag)
          ) AS ranked
          WHERE ranked.rank <= 3
        `),
      ])
    : [[], []];

  const aggregateByItemId = new Map<string, { ratingCount: number; recentCount: number; scoreVariance: number }>();
  for (const row of items) {
    aggregateByItemId.set(row.id, {
      ratingCount: toNumber(row.ratingCount),
      recentCount: toNumber(row.recentCount),
      scoreVariance: roundToTwo(toNumber(row.scoreVariance)),
    });
  }

  const scoreValuesByItemId = new Map<string, Record<string, number>>();
  for (const row of dimensionAverages) {
    const existing = scoreValuesByItemId.get(row.itemId) ?? {};
    existing[row.dimension] = roundToTwo(toNumber(row.value));
    scoreValuesByItemId.set(row.itemId, existing);
  }

  const tagCountsByItemId = new Map<string, Record<string, number>>();
  for (const row of tagCounts) {
    const tag = sanitizeText(row.tag);
    if (!tag) continue;
    const existing = tagCountsByItemId.get(row.itemId) ?? {};
    existing[tag] = toNumber(row.count);
    tagCountsByItemId.set(row.itemId, existing);
  }

  const summaries = items
    .map((item) => buildSummaryFromListAggregates(item, dimensions, aggregateByItemId, scoreValuesByItemId, tagCountsByItemId))
    .filter((item) => sanitizeText(item.name).length > 0);

  const payload: PaginatedRatingList = {
    items: summaries,
    total,
    page,
    limit,
    hasMore: offset + summaries.length < total,
  };

  // Cache result for 10 minutes
  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 600);
  } catch {
    // Redis down — continue without cache
  }

  log.info("list cache miss", {
    category,
    sortMode: effectiveSort,
    page,
    limit,
    query,
    count: summaries.length,
    total,
    durationMs: Date.now() - startedAt,
  });

  return payload;
}

export async function getRatingDetail(categoryInput: string, id: string) {
  const category = parseCategory(categoryInput);
  const cacheKey = getRatingDetailCacheKey(category, id);
  const startedAt = Date.now();

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      log.info("detail cache hit", {
        category,
        itemId: id,
        durationMs: Date.now() - startedAt,
      });
      return parsed;
    }
  } catch {
    // Redis down — fall through to DB
  }

  await ensureRatingSeedData();

  const [item, dimensions, aggregate, scoreValues, tagCounts, commentsPage] = await Promise.all([
    getRatingItemBase(category, id),
    prisma.scoreDimension.findMany({
      where: { category },
      orderBy: { order: "asc" },
      select: {
        name: true,
        label: true,
      },
    }),
    getRatingAggregateForItem(category, id),
    getRatingDimensionAveragesForItem(category, id),
    getRatingTopTagCountsForItem(category, id),
    getRatingCommentsPage(category, id, 1, DETAIL_COMMENTS_PAGE_SIZE),
  ]);

  if (!item) {
    throw new NotFoundError("Rating item not found");
  }

  const summary = buildSummaryFromListAggregates(
    item,
    dimensions,
    new Map([[item.id, aggregate]]),
    new Map([[item.id, scoreValues]]),
    new Map([[item.id, tagCounts]])
  );

  const payload = {
    ...summary,
    comments: commentsPage.data,
    commentCount: commentsPage.total,
    commentsPageSize: commentsPage.limit,
    hasMoreComments: commentsPage.hasMore,
  };

  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", DETAIL_CACHE_TTL_SECONDS);
  } catch {
    // Redis down — continue without cache
  }

  log.info("detail cache miss", {
    category,
    itemId: id,
    ratingCount: payload.ratingCount,
    commentCount: payload.commentCount,
    durationMs: Date.now() - startedAt,
  });

  return payload;
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
      acc[key] = convertSubmittedScoreTo05(numeric);
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

  // Invalidate all known sort-mode caches for this category
  try {
    const listCacheKeys = await redis.keys(getRatingListCachePattern(category));
    const keysToDelete = [
      ...listCacheKeys,
      getRatingTagsCacheKey(category),
      getRatingDetailCacheKey(category, id),
    ];
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch {
    // Redis down — cache will expire naturally (10 min TTL)
  }

  return { success: true };
}
