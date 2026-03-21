/**
 * Full import: create missing courses + import all ratings from course-evaluations.json
 * Run: cd buhub_back && npx tsx scripts/import-course-ratings-full.ts
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

const PREFIX_DEPT: Record<string, string> = {
  ACCT:"Department of Accountancy, Economics and Finance",ARTT:"Academy of Film",
  BAGE:"School of Business",BIOL:"Department of Biology",BMSC:"Department of Biomedical Sciences",
  BUSI:"School of Business",CHEM:"Department of Chemistry",
  CHIL:"Department of Chinese Language and Literature",CHSE:"School of Business",
  CMED:"School of Chinese Medicine",COMM:"Department of Communication Studies",
  COMP:"Department of Computer Science",CGPE:"General Education",CRIN:"Department of Sociology",
  DIFH:"Digital Humanities",ECON:"Department of Accountancy, Economics and Finance",
  EDUC:"Department of Education Studies",ENGL:"Department of English Language and Literature",
  EURO:"European Studies Programme",FAGS:"Faculty of Arts and Social Sciences",
  FILM:"Academy of Film",FINE:"Department of Accountancy, Economics and Finance",
  FREN:"Department of Translation, Interpreting and Intercultural Studies",GAME:"Academy of Film",
  GCAP:"General Education",GCBU:"General Education",GCHC:"General Education",GCIT:"General Education",
  GCLA:"General Education",GCNU:"General Education",GCPE:"General Education",GCPS:"General Education",
  GCSC:"General Education",GCVM:"General Education",GCGE:"General Education",
  GDAR:"General Education",GDBU:"General Education",GDCV:"General Education",GDHC:"General Education",
  GDSC:"General Education",GDSS:"General Education",GDVM:"General Education",
  GCST:"Department of Government and International Studies",
  GEND:"Department of Humanities and Creative Writing",GEOG:"Department of Geography",
  GERM:"Department of Translation, Interpreting and Intercultural Studies",
  GEST:"General Education",GFAI:"General Education",GFCC:"General Education",GFCH:"General Education",
  GFHC:"General Education",GFHL:"General Education",GFQR:"General Education",GFVM:"General Education",
  GFVMM:"General Education",GHFC:"General Education",
  GSIS:"Department of Government and International Studies",
  GTCU:"General Education",GTSC:"General Education",GTSU:"General Education",
  HIST:"Department of History",HRMN:"Department of Management",HSWB:"Department of Social Work",
  HUMN:"Department of Humanities and Creative Writing",IMPP:"Faculty of Interdisciplinary Research",
  ISEM:"School of Business",ITEC:"Department of Computer Science",ITS:"Department of Computer Science",
  JOUR:"Department of Journalism",JPSE:"Department of Translation, Interpreting and Intercultural Studies",
  JSPE:"Department of Translation, Interpreting and Intercultural Studies",
  LANG:"Language Centre",LLAW:"Faculty of Arts and Social Sciences",
  MATH:"Department of Mathematics",MKTG:"Department of Marketing",MUSI:"Department of Music",
  PCMD:"School of Chinese Medicine",PERM:"Academy of Film",PHYS:"Department of Physics",
  POLS:"Department of Government and International Studies",PRAO:"Academy of Film",
  PRAD:"Department of Communication Studies",PSYC:"Department of Psychology",
  QFQR:"General Education",
  RELI:"Department of Religion and Philosophy",REMT:"Department of Physics",
  SIMT:"Faculty of Interdisciplinary Research",SOCI:"Department of Sociology",
  SOSC:"Faculty of Social Sciences",SOWK:"Department of Social Work",
  SPAN:"Department of Translation, Interpreting and Intercultural Studies",
  TRAB:"Department of Translation, Interpreting and Intercultural Studies",
  TRAN:"Department of Translation, Interpreting and Intercultural Studies",
  UCHL:"General Education",UCLA:"General Education",UCLC:"General Education",
  UCPN:"General Education",UPN:"General Education",
  VART:"Academy of Visual Arts",WRIT:"Department of Humanities and Creative Writing",
};

function toBackendScale(score: number): number {
  return Math.round((score / 20) * 100) / 100;
}

function jitter(value: number, range: number): number {
  return Math.max(0, Math.min(100, value + (Math.random() - 0.5) * 2 * range));
}

function randomTags(): string[] {
  const count = Math.floor(Math.random() * 3) + 1;
  return [...DEFAULT_TAGS].sort(() => Math.random() - 0.5).slice(0, count);
}

async function main() {
  const jsonPath = path.resolve(__dirname, "../src/data/course-evaluations.json");
  const evaluations: Array<{
    code: string; name: string;
    reviews: Array<{ comment?: string; grading: number; exam: number; workload: number }>;
  }> = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  console.log(`Loaded ${evaluations.length} courses with evaluations`);

  // 1. Create seed users
  console.log(`Creating ${SEED_USER_COUNT} seed users...`);
  for (let i = 1; i <= SEED_USER_COUNT; i++) {
    const id = `seed-rater-${String(i).padStart(3, "0")}`;
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, nickname: `Seed Rater ${i}`, avatar: "", isActive: false },
    });
  }

  // 2. Create missing courses
  let coursesCreated = 0;
  for (const course of evaluations) {
    const itemId = `course-${course.code}`;
    const exists = await prisma.ratingItem.findUnique({ where: { id: itemId } });
    if (exists) continue;
    const prefix = course.code.match(/^[A-Z]+/)?.[0] || "";
    const dept = PREFIX_DEPT[prefix] || "Hong Kong Baptist University";
    await prisma.ratingItem.create({
      data: { id: itemId, category: RatingCategory.COURSE, name: course.name, department: dept, code: course.code, avatar: "" },
    });
    coursesCreated++;
  }
  console.log(`Created ${coursesCreated} missing courses`);

  // 3. Clear existing course ratings
  const deleted = await prisma.rating.deleteMany({ where: { item: { category: "COURSE" } } });
  console.log(`Cleared ${deleted.count} existing course ratings`);

  // 4. Import ratings
  let totalRatings = 0;
  let coursesProcessed = 0;

  for (const course of evaluations) {
    const itemId = `course-${course.code}`;
    const realReviews = course.reviews || [];
    const targetCount = MIN_RATINGS + Math.floor(Math.random() * (MAX_RATINGS - MIN_RATINGS + 1));

    const avgGrading = realReviews.reduce((s, r) => s + r.grading, 0) / (realReviews.length || 1);
    const avgExam = realReviews.reduce((s, r) => s + r.exam, 0) / (realReviews.length || 1);
    const avgWorkload = realReviews.reduce((s, r) => s + r.workload, 0) / (realReviews.length || 1);

    const usedUsers = new Set<string>();
    const ratings: Array<{ userId: string; itemId: string; scores: object; tags: string[]; comment: string | null }> = [];

    // Real reviews
    for (let i = 0; i < realReviews.length && ratings.length < targetCount; i++) {
      const userId = `seed-rater-${String((i % SEED_USER_COUNT) + 1).padStart(3, "0")}`;
      if (usedUsers.has(userId)) continue;
      usedUsers.add(userId);
      ratings.push({
        userId, itemId,
        scores: { grading: toBackendScale(realReviews[i].grading), exam: toBackendScale(realReviews[i].exam), workload: toBackendScale(realReviews[i].workload) },
        tags: randomTags(),
        comment: realReviews[i].comment || null,
      });
    }

    // Simulated ratings to fill
    for (let i = ratings.length; i < targetCount; i++) {
      const userId = `seed-rater-${String((i % SEED_USER_COUNT) + 1).padStart(3, "0")}`;
      if (usedUsers.has(userId)) continue;
      usedUsers.add(userId);
      ratings.push({
        userId, itemId,
        scores: { grading: toBackendScale(jitter(avgGrading, 15)), exam: toBackendScale(jitter(avgExam, 15)), workload: toBackendScale(jitter(avgWorkload, 15)) },
        tags: randomTags(),
        comment: null,
      });
    }

    for (const r of ratings) {
      await prisma.rating.create({ data: r });
      totalRatings++;
    }
    coursesProcessed++;
    if (coursesProcessed % 100 === 0) console.log(`  Processed ${coursesProcessed}/${evaluations.length}...`);
  }

  // 5. Clear Redis cache
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const keys = await redis.keys("rating:list:*");
    if (keys.length > 0) await redis.del(...keys);
    console.log(`Cleared ${keys.length} Redis cache keys`);
    await redis.quit();
  } catch { console.log("Redis cache clear skipped"); }

  const totalCourses = await prisma.ratingItem.count({ where: { category: "COURSE" } });
  const totalCourseRatings = await prisma.rating.count({ where: { item: { category: "COURSE" } } });
  const withRatings = await prisma.ratingItem.count({ where: { category: "COURSE", ratings: { some: {} } } });

  console.log(`\nDone!`);
  console.log(`  Courses created: ${coursesCreated}`);
  console.log(`  Courses processed: ${coursesProcessed}`);
  console.log(`  Total ratings: ${totalRatings}`);
  console.log(`  Total courses in DB: ${totalCourses}`);
  console.log(`  Courses with ratings: ${withRatings}`);
  console.log(`  Total course ratings: ${totalCourseRatings}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
