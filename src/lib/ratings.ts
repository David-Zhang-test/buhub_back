import { RatingCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
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
    { key: "pedagogy", label: "Teaching Quality", left: "Engaging", right: "Boring" },
    { key: "supportive", label: "Friendliness", left: "Very Friendly", right: "Cold" },
    { key: "strictness", label: "Strictness", left: "Relaxed", right: "Very Strict" },
  ],
  [RatingCategory.COURSE]: [
    { key: "grading", label: "Grading", left: "Grade God", right: "Grade Killer" },
    { key: "workload", label: "Workload", left: "Light", right: "Heavy" },
    { key: "difficulty", label: "Difficulty", left: "Easy", right: "Hard" },
  ],
  [RatingCategory.CANTEEN]: [
    { key: "taste", label: "Taste", left: "Terrible", right: "Delicious" },
    { key: "hygiene", label: "Hygiene", left: "Needs Work", right: "Clean" },
    { key: "value", label: "Value", left: "Pricey", right: "Great Value" },
  ],
  [RatingCategory.MAJOR]: [
    { key: "employment", label: "Employment", left: "Uncertain", right: "Promising" },
    { key: "support", label: "Support", left: "On Your Own", right: "Well Supported" },
    { key: "satisfaction", label: "Satisfaction", left: "Average", right: "Very Satisfied" },
  ],
};

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

export async function ensureRatingSeedData() {
  const dimensionUpserts = Object.entries(DIMENSION_FIXTURES).flatMap(([category, dimensions]) =>
    dimensions.map((dimension, index) =>
      prisma.scoreDimension.upsert({
        where: {
          category_name: {
            category: category as RatingCategory,
            name: dimension.key,
          },
        },
        update: {
          label: {
            tc: dimension.label,
            sc: dimension.label,
            en: dimension.label,
            left: dimension.left,
            right: dimension.right,
          },
          order: index,
        },
        create: {
          category: category as RatingCategory,
          name: dimension.key,
          label: {
            tc: dimension.label,
            sc: dimension.label,
            en: dimension.label,
            left: dimension.left,
            right: dimension.right,
          },
          order: index,
        },
      })
    )
  );

  await Promise.all(dimensionUpserts);
}

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

  return buildTagOptions(items.flatMap((item) => item.ratings));
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
    const labelValue = (dimension.label as Record<string, unknown> | null)?.tc;
    const label = typeof labelValue === "string" && labelValue.trim() ? labelValue : dimension.name;
    return {
      key: dimension.name,
      label,
      value: roundToTwo(scoreValues[dimension.name] ?? 0),
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

  if ((sortMode ?? "recent") === "controversial") {
    summaries.sort((a, b) => b.scoreVariance - a.scoreVariance || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name));
  } else {
    summaries.sort((a, b) => b.recentCount - a.recentCount || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name));
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

  return buildSummaryFromItem(item, dimensions);
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

  return { success: true };
}
