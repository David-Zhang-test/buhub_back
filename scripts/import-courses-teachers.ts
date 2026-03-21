/**
 * Import courses and teachers from Excel files into the rating system.
 *
 * Source files:
 * - docs/HKBU_Courses_Instructors_Emails_2025_S2.xls  (892 courses with instructors)
 * - docs/HKBU_Instructor_Emails_2025_S2 (1).xls       (700 instructors with emails)
 *
 * Run: cd buhub_back && npx tsx scripts/import-courses-teachers.ts
 */

import * as XLSX from "xlsx";
import { PrismaClient, RatingCategory } from "@prisma/client";
import path from "path";

const prisma = new PrismaClient();

// ── Course code prefix → Department mapping ──────────────────────────
const PREFIX_DEPARTMENT: Record<string, string> = {
  ACCT: "Department of Accountancy, Economics and Finance",
  ARTT: "Academy of Film",
  BAGE: "School of Business",
  BIOL: "Department of Biology",
  BMSC: "Department of Biomedical Sciences",
  BUSI: "School of Business",
  CHEM: "Department of Chemistry",
  CHIL: "Department of Chinese Language and Literature",
  CMED: "School of Chinese Medicine",
  COMM: "Department of Communication Studies",
  COMP: "Department of Computer Science",
  CRIN: "Department of Sociology",
  DIFH: "Digital Humanities",
  ECON: "Department of Accountancy, Economics and Finance",
  EDUC: "Department of Education Studies",
  ENGL: "Department of English Language and Literature",
  EURO: "European Studies Programme",
  FAGS: "Faculty of Arts and Social Sciences",
  FILM: "Academy of Film",
  FINE: "Academy of Visual Arts",
  FREN: "Department of Translation, Interpreting and Intercultural Studies",
  GAME: "Academy of Film",
  GCAP: "General Education",
  GCST: "Department of Government and International Studies",
  GEND: "Department of Humanities and Creative Writing",
  GEOG: "Department of Geography",
  GERM: "Department of Translation, Interpreting and Intercultural Studies",
  GEST: "General Education",
  GFAI: "General Education",
  GFCC: "General Education",
  GFHC: "General Education",
  GFHL: "General Education",
  GFQR: "General Education",
  GFVM: "General Education",
  GSIS: "Department of Government and International Studies",
  GTCU: "General Education",
  GTSC: "General Education",
  GTSU: "General Education",
  HIST: "Department of History",
  HRMN: "Department of Management",
  HSWB: "Department of Social Work",
  HUMN: "Department of Humanities and Creative Writing",
  IMPP: "Faculty of Interdisciplinary Research",
  ISEM: "School of Business",
  ITEC: "Department of Computer Science",
  ITS: "Department of Computer Science",
  JOUR: "Department of Journalism",
  JPSE: "Department of Translation, Interpreting and Intercultural Studies",
  LANG: "Language Centre",
  LLAW: "Faculty of Arts and Social Sciences",
  MATH: "Department of Mathematics",
  MKTG: "Department of Marketing",
  MUSI: "Department of Music",
  PCMD: "School of Chinese Medicine",
  PERM: "Academy of Film",
  POLS: "Department of Government and International Studies",
  PRAO: "Academy of Film",
  PSYC: "Department of Psychology",
  RELI: "Department of Religion and Philosophy",
  REMT: "Department of Physics",
  SIMT: "Faculty of Interdisciplinary Research",
  SOCI: "Department of Sociology",
  SOSC: "Faculty of Social Sciences",
  SOWK: "Department of Social Work",
  SPAN: "Department of Translation, Interpreting and Intercultural Studies",
  TRAN: "Department of Translation, Interpreting and Intercultural Studies",
  UCHL: "General Education",
  UCLC: "General Education",
  UCPN: "General Education",
  VART: "Academy of Visual Arts",
  WRIT: "Department of Humanities and Creative Writing",
};

function getDepartment(code: string): string {
  const prefix = code.match(/^[A-Z]+/)?.[0] || "";
  return PREFIX_DEPARTMENT[prefix] || "Hong Kong Baptist University";
}

// Normalize instructor name for matching between files
function normalizeName(name: string): string {
  return name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs|Miss)\s+/i, "")
    .replace(/\s*,\s*/g, " ")
    .trim()
    .toLowerCase();
}

async function main() {
  const docsDir = path.resolve(__dirname, "../../docs");

  // ── Load Excel files ───────────────────────────────────────────────
  const coursesFile = XLSX.readFile(path.join(docsDir, "HKBU_Courses_Instructors_Emails_2025_S2.xls"));
  const coursesSheet = coursesFile.Sheets[coursesFile.SheetNames[0]];
  const coursesData = XLSX.utils.sheet_to_json(coursesSheet) as Record<string, unknown>[];

  const emailsFile = XLSX.readFile(path.join(docsDir, "HKBU_Instructor_Emails_2025_S2 (1).xls"));
  const emailsSheet = emailsFile.Sheets[emailsFile.SheetNames[0]];
  const emailsData = XLSX.utils.sheet_to_json(emailsSheet) as Record<string, unknown>[];

  console.log(`Loaded ${coursesData.length} courses, ${emailsData.length} instructor email records`);

  // ── Build email lookup (normalized name → email) ───────────────────
  const emailLookup = new Map<string, string>();
  for (const row of emailsData) {
    const name = String(row["Instructor Name"] || "").trim();
    const email = String(row["Email"] || "").trim();
    if (name) {
      emailLookup.set(normalizeName(name), email);
      // Also store original name lowercased
      emailLookup.set(name.toLowerCase(), email);
    }
  }

  // ── Also extract emails from courses file (Email(s) column) ────────
  // Build a mapping: original instructor name → email from courses file
  const courseEmailLookup = new Map<string, string>();
  for (const row of coursesData) {
    const instructors = String(row["Instructor(s)"] || "").split(";").map((s) => s.trim()).filter(Boolean);
    const emails = String(row["Email(s)"] || "").split(";").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < instructors.length; i++) {
      if (emails[i]) {
        courseEmailLookup.set(normalizeName(instructors[i]), emails[i]);
      }
    }
  }

  // ── Collect unique teachers ────────────────────────────────────────
  // teacher key: normalized name, value: { name, email, departments[] }
  const teacherMap = new Map<string, { name: string; email: string; departments: Set<string> }>();

  for (const row of coursesData) {
    const code = String(row["Course Code"] || "").trim();
    const department = getDepartment(code);
    const instructors = String(row["Instructor(s)"] || "").split(";").map((s) => s.trim()).filter(Boolean);

    for (const rawName of instructors) {
      const key = normalizeName(rawName);
      if (!key) continue;

      if (!teacherMap.has(key)) {
        // Try to find email: first from email file, then from courses file
        const email = emailLookup.get(key) || courseEmailLookup.get(key) || "";
        teacherMap.set(key, { name: rawName, email, departments: new Set() });
      }
      teacherMap.get(key)!.departments.add(department);
    }
  }

  // Also add teachers from emails file that might not appear in courses
  for (const row of emailsData) {
    const rawName = String(row["Instructor Name"] || "").trim();
    const email = String(row["Email"] || "").trim();
    const key = normalizeName(rawName);
    if (!key) continue;
    if (!teacherMap.has(key)) {
      teacherMap.set(key, { name: rawName, email, departments: new Set(["Hong Kong Baptist University"]) });
    } else if (email && !teacherMap.get(key)!.email) {
      teacherMap.get(key)!.email = email;
    }
  }

  console.log(`Found ${teacherMap.size} unique teachers`);

  // ── Clear existing courses and teachers ────────────────────────────
  const deletedCourseRatings = await prisma.rating.deleteMany({ where: { item: { category: "COURSE" } } });
  const deletedTeacherRatings = await prisma.rating.deleteMany({ where: { item: { category: "TEACHER" } } });
  const deletedCourses = await prisma.ratingItem.deleteMany({ where: { category: "COURSE" } });
  const deletedTeachers = await prisma.ratingItem.deleteMany({ where: { category: "TEACHER" } });
  console.log(`Cleared: ${deletedCourses.count} courses, ${deletedTeachers.count} teachers, ${deletedCourseRatings.count + deletedTeacherRatings.count} ratings`);

  // ── Import courses ─────────────────────────────────────────────────
  const courseRecords = coursesData.map((row) => {
    const code = String(row["Course Code"] || "").trim();
    const name = String(row["Course Title"] || "").trim();
    const department = getDepartment(code);
    return {
      id: `course-${code}`,
      category: RatingCategory.COURSE,
      name,
      department,
      code,
      email: null as string | null,
      location: null as string | null,
      avatar: "",
    };
  });

  // Deduplicate by code (keep first occurrence)
  const seenCodes = new Set<string>();
  const uniqueCourses = courseRecords.filter((c) => {
    if (seenCodes.has(c.code!)) return false;
    seenCodes.add(c.code!);
    return true;
  });

  let coursesCreated = 0;
  for (const course of uniqueCourses) {
    await prisma.ratingItem.create({ data: course });
    coursesCreated++;
  }
  console.log(`Created ${coursesCreated} courses`);

  // ── Import teachers ────────────────────────────────────────────────
  let teachersCreated = 0;
  let teachersWithEmail = 0;
  const teacherEntries = Array.from(teacherMap.entries());

  for (const [key, teacher] of teacherEntries) {
    const department = Array.from(teacher.departments)[0] || "Hong Kong Baptist University";
    const id = `teacher-${key.replace(/[^a-z0-9]/g, "-").slice(0, 60)}`;

    await prisma.ratingItem.create({
      data: {
        id,
        category: RatingCategory.TEACHER,
        name: teacher.name,
        department,
        email: teacher.email || null,
        code: null,
        location: null,
        avatar: "",
      },
    });
    teachersCreated++;
    if (teacher.email) teachersWithEmail++;
  }
  console.log(`Created ${teachersCreated} teachers (${teachersWithEmail} with email, ${teachersCreated - teachersWithEmail} without)`);

  // ── Summary ────────────────────────────────────────────────────────
  const totalCourses = await prisma.ratingItem.count({ where: { category: "COURSE" } });
  const totalTeachers = await prisma.ratingItem.count({ where: { category: "TEACHER" } });
  console.log(`\nFinal totals: ${totalCourses} courses, ${totalTeachers} teachers`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
