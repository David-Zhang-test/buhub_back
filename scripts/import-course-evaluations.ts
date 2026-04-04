/**
 * One-time import script: Import course evaluation data from HKBU_Course_Evaluation_V2.xlsx
 *
 * Run: npx tsx scripts/import-course-evaluations.ts
 *
 * Logic:
 * 1. Create 60 seed virtual users
 * 2. For each Excel course:
 *    - Find existing RatingItem by code → use it; not found → create new one
 *    - Generate 5-20 ratings with real comments + simulated scores
 * 3. No duplicate courses
 */

import { PrismaClient, RatingCategory } from "@prisma/client";
import courseEvaluations from "../src/data/course-evaluations.json";

const prisma = new PrismaClient();

const PREFIX_TO_DEPARTMENT: Record<string, string> = {
  ACCT: "Department of Accountancy, Economics and Finance",
  BUSI: "School of Business",
  CGPE: "Whole Person Development",
  CHEM: "Department of Chemistry",
  CHIL: "Department of Chinese Language and Literature",
  CHSE: "Academy of Global China Studies",
  COMM: "Department of Communication Studies",
  COMP: "Department of Computer Science",
  ECON: "Department of Accountancy, Economics and Finance",
  EDUC: "Department of Sport, Physical Education and Health",
  ENGL: "Department of English Language and Literature",
  EURO: "Faculty of Arts and Social Sciences",
  FILM: "Academy of Film",
  FINE: "Academy of Visual Arts",
  FREN: "Language Centre",
  GCAP: "Faculty of Arts and Social Sciences",
  GCBU: "School of Business",
  GCHC: "Faculty of Arts and Social Sciences (CHRP)",
  GCIT: "Faculty of Science",
  GCLA: "Language Centre",
  GCNU: "Faculty of Science",
  GCPE: "Whole Person Development",
  GCPS: "Faculty of Science",
  GCSC: "Faculty of Science",
  GCVM: "Faculty of Arts and Social Sciences",
  GDAR: "School of Creative Arts",
  GDBU: "School of Business",
  GDCV: "Faculty of Arts and Social Sciences",
  GDHC: "Faculty of Arts and Social Sciences (CHRP)",
  GDSC: "Faculty of Science",
  GDSS: "Faculty of Arts and Social Sciences",
  GDVM: "Faculty of Arts and Social Sciences",
  GEOG: "Department of Geography",
  GERM: "Language Centre",
  GFCH: "Faculty of Arts and Social Sciences (CHRP)",
  GFHC: "Faculty of Arts and Social Sciences (CHRP)",
  GFQR: "Faculty of Science",
  GFVM: "Faculty of Arts and Social Sciences",
  GFVMM: "Faculty of Arts and Social Sciences",
  GHFC: "Faculty of Arts and Social Sciences (CHRP)",
  GTCU: "Faculty of Arts and Social Sciences",
  GTSC: "Faculty of Science",
  GTSU: "Faculty of Arts and Social Sciences",
  HIST: "Department of History",
  HRMN: "School of Business",
  HUMN: "Department of Humanities and Creative Writing",
  ISEM: "School of Business",
  ITEC: "Department of Computer Science",
  JOUR: "Department of Journalism",
  JPSE: "Language Centre",
  JSPE: "Language Centre",
  LANG: "Language Centre",
  LLAW: "Faculty of Arts and Social Sciences",
  MATH: "Department of Mathematics",
  MKTG: "Department of Management, Marketing and Information Systems",
  MUSI: "Academy of Music",
  PHYS: "Department of Physics",
  POLS: "Department of Government and International Studies",
  PRAD: "School of Communication",
  PSYC: "Faculty of Arts and Social Sciences",
  QFQR: "Faculty of Science",
  RELI: "Department of Religion and Philosophy",
  SOCI: "Department of Sociology",
  SOSC: "Faculty of Arts and Social Sciences",
  SPAN: "Language Centre",
  TRAB: "Department of Translation, Interpreting and Intercultural Studies",
  TRAN: "Department of Translation, Interpreting and Intercultural Studies",
  UCHL: "Department of Chinese Language and Literature",
  UCLA: "Language Centre",
  UCLC: "Language Centre",
  UCPN: "Whole Person Development",
  UPN: "Whole Person Development",
  WRIT: "Department of Humanities and Creative Writing",
};

function getDepartment(code: string): string {
  const prefix = code.replace(/\d+$/, "");
  return PREFIX_TO_DEPARTMENT[prefix] || "Faculty of Arts and Social Sciences";
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function jitterScore(target: number, spread: number = 8): number {
  const offset = (Math.random() - 0.5) * 2 * spread;
  return clamp(Math.round(target + offset), 5, 95);
}

// Convert 0-100 scale to 0-5 backend scale
function toBackendScale(score: number): number {
  return Math.round((score / 20) * 100) / 100;
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function getUserEmailType(email: string): "hkbu" | "primary" {
  return normalizeEmailAddress(email).endsWith("@life.hkbu.edu.hk") ? "hkbu" : "primary";
}

async function ensureSeedUserEmail(userId: string, email: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const existing = await prisma.userEmail.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, userId: true },
  });

  if (existing && existing.userId !== userId) {
    throw new Error(`Seed email is already linked to another user: ${normalizedEmail}`);
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

async function main() {
  console.log(`Starting import of ${courseEvaluations.length} courses...`);

  // 1. Create virtual seed users
  const SEED_USER_COUNT = 60;
  const seedUserIds: string[] = [];
  for (let i = 1; i <= SEED_USER_COUNT; i++) {
    const id = `seed-rater-${String(i).padStart(3, "0")}`;
    const seedEmail = `seed-rater-${i}@hkbu.edu.hk`;
    seedUserIds.push(id);
    await prisma.user.upsert({
      where: { id },
      update: {
        nickname: `Reviewer ${i}`,
        avatar: "",
        isActive: false,
        isBanned: false,
        role: "USER",
      },
      create: {
        id,
        nickname: `Reviewer ${i}`,
        avatar: "",
        isActive: false,
        isBanned: false,
        role: "USER",
      },
    });
    await ensureSeedUserEmail(id, seedEmail);
  }
  console.log(`Created/verified ${SEED_USER_COUNT} seed users`);

  let coursesCreated = 0;
  let coursesExisting = 0;
  let ratingsCreated = 0;
  let coursesSkipped = 0;

  for (const course of courseEvaluations) {
    const reviews = course.reviews as Array<{
      comment: string;
      grading: number;
      exam: number;
      workload: number;
    }>;

    if (reviews.length === 0) {
      coursesSkipped++;
      continue;
    }

    // 2. Find existing course by code, or create new one
    let itemId: string;
    const existing = await prisma.ratingItem.findFirst({
      where: { category: RatingCategory.COURSE, code: course.code },
      select: { id: true },
    });

    if (existing) {
      itemId = existing.id;
      coursesExisting++;
    } else {
      // Create new course
      itemId = `course${course.code}`;
      const department = getDepartment(course.code);
      await prisma.ratingItem.create({
        data: {
          id: itemId,
          category: RatingCategory.COURSE,
          name: course.name,
          department,
          code: course.code,
        },
      });
      coursesCreated++;
    }

    // 3. Check if already has seed ratings → skip
    const existingRatingCount = await prisma.rating.count({
      where: { itemId, userId: { startsWith: "seed-rater-" } },
    });
    if (existingRatingCount > 0) continue;

    // 4. Calculate averages from real reviews
    const avgGrading = reviews.reduce((s, r) => s + r.grading, 0) / reviews.length;
    const avgExam = reviews.reduce((s, r) => s + r.exam, 0) / reviews.length;
    const avgWorkload = reviews.reduce((s, r) => s + r.workload, 0) / reviews.length;

    // 5. Total raters: 5-20
    const totalRaters = Math.floor(Math.random() * 16) + 5;

    // 6. Import real comments first
    const realCount = Math.min(reviews.length, totalRaters);
    for (let i = 0; i < realCount; i++) {
      const review = reviews[i];
      const userId = seedUserIds[i % SEED_USER_COUNT];

      const alreadyRated = await prisma.rating.findFirst({
        where: { itemId, userId },
        select: { id: true },
      });
      if (alreadyRated) continue;

      await prisma.rating.create({
        data: {
          itemId,
          userId,
          scores: {
            grading: toBackendScale(review.grading),
            exam: toBackendScale(review.exam),
            workload: toBackendScale(review.workload),
          },
          tags: [],
          comment: review.comment || null,
        },
      });
      ratingsCreated++;
    }

    // 7. Fill remaining with score-only ratings
    const remaining = totalRaters - realCount;
    for (let i = 0; i < remaining; i++) {
      const userId = seedUserIds[(realCount + i) % SEED_USER_COUNT];

      const alreadyRated = await prisma.rating.findFirst({
        where: { itemId, userId },
        select: { id: true },
      });
      if (alreadyRated) continue;

      await prisma.rating.create({
        data: {
          itemId,
          userId,
          scores: {
            grading: toBackendScale(jitterScore(avgGrading)),
            exam: toBackendScale(jitterScore(avgExam)),
            workload: toBackendScale(jitterScore(avgWorkload)),
          },
          tags: [],
          comment: null,
        },
      });
      ratingsCreated++;
    }
  }

  console.log(`\nImport complete!`);
  console.log(`  Courses found existing: ${coursesExisting}`);
  console.log(`  Courses created new: ${coursesCreated}`);
  console.log(`  Courses skipped (no reviews): ${coursesSkipped}`);
  console.log(`  Total courses in DB: ${coursesExisting + coursesCreated}`);
  console.log(`  Ratings created: ${ratingsCreated}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
