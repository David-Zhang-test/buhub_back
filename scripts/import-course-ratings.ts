/**
 * Import course ratings from course-evaluations.json
 * Matches by course code to existing DB courses (id: course-{CODE})
 * Creates 5-20 ratings per course with real comments + simulated scores
 *
 * Run: cd buhub_back && npx tsx scripts/import-course-ratings.ts
 */

import { PrismaClient, RatingCategory } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SEED_USER_COUNT = 60;
const MIN_RATINGS = 5;
const MAX_RATINGS = 20;

const DEFAULT_TAGS = [
  "#Practical", "#Interesting", "#Group Project", "#Good Grades",
  "#Easy Exams", "#Recommended", "#Less HW", "#Beginner Friendly",
];

function toBackendScale(score: number): number {
  // 0-100 → 0-5
  return Math.round((score / 20) * 100) / 100;
}

function jitter(value: number, range: number): number {
  const result = value + (Math.random() - 0.5) * 2 * range;
  return Math.max(0, Math.min(100, result));
}

function randomTags(): string[] {
  const count = Math.floor(Math.random() * 3) + 1;
  const shuffled = [...DEFAULT_TAGS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function main() {
  // 1. Load evaluation data
  const jsonPath = path.resolve(__dirname, "../src/data/course-evaluations.json");
  const evaluations: Array<{
    code: string;
    name: string;
    reviews: Array<{ comment?: string; grading: number; exam: number; workload: number }>;
  }> = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  console.log(`Loaded ${evaluations.length} courses with evaluations`);

  // 2. Create/verify seed users
  console.log(`Creating ${SEED_USER_COUNT} seed users...`);
  for (let i = 1; i <= SEED_USER_COUNT; i++) {
    const id = `seed-rater-${String(i).padStart(3, "0")}`;
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        nickname: `Seed Rater ${i}`,
        avatar: "",
        isActive: false,
      },
    });
  }

  // 3. Clear existing course ratings
  const deleted = await prisma.rating.deleteMany({
    where: { item: { category: "COURSE" } },
  });
  console.log(`Cleared ${deleted.count} existing course ratings`);

  // 4. Import ratings
  let totalRatings = 0;
  let coursesMatched = 0;
  let coursesSkipped = 0;

  for (const course of evaluations) {
    // Match by code → id: course-{CODE}
    const itemId = `course-${course.code}`;
    const existing = await prisma.ratingItem.findUnique({ where: { id: itemId } });

    if (!existing) {
      coursesSkipped++;
      continue;
    }
    coursesMatched++;

    const realReviews = course.reviews || [];
    const targetCount = MIN_RATINGS + Math.floor(Math.random() * (MAX_RATINGS - MIN_RATINGS + 1));

    // Calculate average scores from real reviews for jittering simulated ones
    const avgGrading = realReviews.reduce((s, r) => s + r.grading, 0) / (realReviews.length || 1);
    const avgExam = realReviews.reduce((s, r) => s + r.exam, 0) / (realReviews.length || 1);
    const avgWorkload = realReviews.reduce((s, r) => s + r.workload, 0) / (realReviews.length || 1);

    const ratings: Array<{
      userId: string;
      itemId: string;
      scores: Record<string, number>;
      tags: string[];
      comment: string | null;
    }> = [];

    // Real reviews first
    for (let i = 0; i < realReviews.length && i < targetCount; i++) {
      const review = realReviews[i];
      const userId = `seed-rater-${String((i % SEED_USER_COUNT) + 1).padStart(3, "0")}`;

      // Check duplicate
      const exists = ratings.some((r) => r.userId === userId && r.itemId === itemId);
      if (exists) continue;

      ratings.push({
        userId,
        itemId,
        scores: {
          grading: toBackendScale(review.grading),
          exam: toBackendScale(review.exam),
          workload: toBackendScale(review.workload),
        },
        tags: randomTags(),
        comment: review.comment || null,
      });
    }

    // Fill remaining with simulated ratings
    for (let i = ratings.length; i < targetCount; i++) {
      const userId = `seed-rater-${String((i % SEED_USER_COUNT) + 1).padStart(3, "0")}`;

      const exists = ratings.some((r) => r.userId === userId && r.itemId === itemId);
      if (exists) continue;

      ratings.push({
        userId,
        itemId,
        scores: {
          grading: toBackendScale(jitter(avgGrading, 15)),
          exam: toBackendScale(jitter(avgExam, 15)),
          workload: toBackendScale(jitter(avgWorkload, 15)),
        },
        tags: randomTags(),
        comment: null,
      });
    }

    // Batch create
    for (const rating of ratings) {
      await prisma.rating.create({ data: rating });
      totalRatings++;
    }
  }

  // 5. Clear Redis cache
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const keys = await redis.keys("rating:list:*");
    if (keys.length > 0) await redis.del(...keys);
    console.log(`Cleared ${keys.length} Redis cache keys`);
    await redis.quit();
  } catch {
    console.log("Redis cache clear skipped (not available)");
  }

  // Summary
  console.log(`\nDone!`);
  console.log(`  Courses matched: ${coursesMatched}`);
  console.log(`  Courses skipped (not in DB): ${coursesSkipped}`);
  console.log(`  Total ratings created: ${totalRatings}`);

  const finalCount = await prisma.rating.count({ where: { item: { category: "COURSE" } } });
  console.log(`  Final course ratings in DB: ${finalCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
