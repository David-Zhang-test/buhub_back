import * as XLSX from "xlsx";
import { PrismaClient, RatingCategory } from "@prisma/client";

const prisma = new PrismaClient();

const PREFIX_DEPT: Record<string, string> = {
  ACCT: "Department of Accountancy, Economics and Finance",
  ARTT: "Academy of Film", BAGE: "School of Business",
  BIOL: "Department of Biology", BMSC: "Department of Biomedical Sciences",
  BUSI: "School of Business", CHEM: "Department of Chemistry",
  CHIL: "Department of Chinese Language and Literature",
  CMED: "School of Chinese Medicine", COMM: "Department of Communication Studies",
  COMP: "Department of Computer Science", CRIN: "Department of Sociology",
  DIFH: "Digital Humanities", ECON: "Department of Accountancy, Economics and Finance",
  EDUC: "Department of Education Studies",
  ENGL: "Department of English Language and Literature",
  EURO: "European Studies Programme", FAGS: "Faculty of Arts and Social Sciences",
  FILM: "Academy of Film", FINE: "Academy of Visual Arts",
  FREN: "Department of Translation, Interpreting and Intercultural Studies",
  GAME: "Academy of Film", GCAP: "General Education",
  GCST: "Department of Government and International Studies",
  GEND: "Department of Humanities and Creative Writing",
  GEOG: "Department of Geography",
  GERM: "Department of Translation, Interpreting and Intercultural Studies",
  GEST: "General Education", GFAI: "General Education", GFCC: "General Education",
  GFHC: "General Education", GFHL: "General Education", GFQR: "General Education",
  GFVM: "General Education", GSIS: "Department of Government and International Studies",
  GTCU: "General Education", GTSC: "General Education", GTSU: "General Education",
  HIST: "Department of History", HRMN: "Department of Management",
  HSWB: "Department of Social Work",
  HUMN: "Department of Humanities and Creative Writing",
  IMPP: "Faculty of Interdisciplinary Research", ISEM: "School of Business",
  ITEC: "Department of Computer Science", ITS: "Department of Computer Science",
  JOUR: "Department of Journalism",
  JPSE: "Department of Translation, Interpreting and Intercultural Studies",
  LANG: "Language Centre", LLAW: "Faculty of Arts and Social Sciences",
  MATH: "Department of Mathematics", MKTG: "Department of Marketing",
  MUSI: "Department of Music", PCMD: "School of Chinese Medicine",
  PERM: "Academy of Film", POLS: "Department of Government and International Studies",
  PRAO: "Academy of Film", PSYC: "Department of Psychology",
  RELI: "Department of Religion and Philosophy", REMT: "Department of Physics",
  SIMT: "Faculty of Interdisciplinary Research", SOCI: "Department of Sociology",
  SOSC: "Faculty of Social Sciences", SOWK: "Department of Social Work",
  SPAN: "Department of Translation, Interpreting and Intercultural Studies",
  TRAN: "Department of Translation, Interpreting and Intercultural Studies",
  UCHL: "General Education", UCLC: "General Education", UCPN: "General Education",
  VART: "Academy of Visual Arts",
  WRIT: "Department of Humanities and Creative Writing",
};

function normalizeName(name: string): string {
  return name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs|Miss)\s+/i, "")
    .replace(/\s*,\s*/g, " ")
    .trim()
    .toLowerCase();
}

// Extract name tokens (alphabetic parts, lowercased) for fuzzy email matching
function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// Check whether an email username plausibly belongs to a given instructor name.
// Requires at least one token of 3+ characters to match, avoiding false positives on short surnames.
function emailMatchesName(email: string, name: string): boolean {
  const user = email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!user || user.length < 3) return false;
  const tokens = nameTokens(name);
  for (const tok of tokens) {
    if (tok.length >= 3 && (user.includes(tok) || tok.includes(user))) return true;
  }
  return false;
}

async function main() {
  const docsDir = "/Users/krabbypatty/Desktop/UHUB-Development/docs";

  // ── 1. Load courses file (1.xls) — get teacher → department mapping ──
  const coursesFile = XLSX.readFile(`${docsDir}/1.xls`);
  const coursesSheet = coursesFile.Sheets[coursesFile.SheetNames[0]];
  const coursesData = XLSX.utils.sheet_to_json(coursesSheet) as Record<string, unknown>[];

  // Build: normalized teacher name → { displayName, email, departments }
  const teacherMap = new Map<string, { name: string; email: string; departments: Set<string> }>();

  // Extract teachers + departments + emails from courses file
  //
  // IMPORTANT: Only use positional pairing when instructor count == email count
  // (guaranteed 1:1 correspondence). When counts differ, use heuristic matching
  // (email username <-> name tokens) to avoid assigning wrong emails.
  for (const row of coursesData) {
    const code = String(row["Course Code"] || "").trim();
    const prefix = code.match(/^[A-Z]+/)?.[0] || "";
    const department = PREFIX_DEPT[prefix] || "Hong Kong Baptist University";
    const instructors = String(row["Instructor(s)"] || "").split(";").map((s) => s.trim()).filter(Boolean);
    const rawEmails = String(row["Email(s)"] || "").split(";").map((s) => s.trim());
    const emails = rawEmails.filter(Boolean);

    // Build a safe instructor-to-email map for this row
    const rowEmailMap = new Map<string, string>();
    if (instructors.length === emails.length) {
      // Safe: 1:1 positional pairing
      for (let i = 0; i < instructors.length; i++) {
        if (emails[i]) rowEmailMap.set(normalizeName(instructors[i]), emails[i]);
      }
    } else {
      // Counts differ -- heuristic: match each email to the instructor
      // whose name best matches the email username
      for (const email of emails) {
        if (!email) continue;
        for (const inst of instructors) {
          if (emailMatchesName(email, inst)) {
            rowEmailMap.set(normalizeName(inst), email);
            break;
          }
        }
      }
    }

    for (const inst of instructors) {
      const key = normalizeName(inst);
      if (!key) continue;

      if (!teacherMap.has(key)) {
        teacherMap.set(key, { name: inst, email: rowEmailMap.get(key) || "", departments: new Set() });
      } else {
        if (rowEmailMap.get(key) && !teacherMap.get(key)!.email) {
          teacherMap.get(key)!.email = rowEmailMap.get(key)!;
        }
      }
      teacherMap.get(key)!.departments.add(department);
    }
  }

  // ── 2. Load instructor emails file (2.xls) — merge emails ──
  const emailsFile = XLSX.readFile(`${docsDir}/2.xls`);
  const emailsSheet = emailsFile.Sheets[emailsFile.SheetNames[0]];
  const emailsData = XLSX.utils.sheet_to_json(emailsSheet) as Record<string, unknown>[];

  for (const row of emailsData) {
    const rawName = String(row["Instructor Name"] || "").trim();
    const email = String(row["Email"] || "").trim();
    const key = normalizeName(rawName);
    if (!key) continue;

    if (!teacherMap.has(key)) {
      // Teacher only in emails file, not in any course
      teacherMap.set(key, { name: rawName, email, departments: new Set(["Hong Kong Baptist University"]) });
    } else {
      // Merge email if missing
      if (email && !teacherMap.get(key)!.email) {
        teacherMap.get(key)!.email = email;
      }
    }
  }

  console.log(`Found ${teacherMap.size} unique teachers`);

  // ── 3. Import to database ──
  let created = 0;
  let withEmail = 0;

  for (const [key, teacher] of teacherMap.entries()) {
    const department = Array.from(teacher.departments)[0] || "Hong Kong Baptist University";
    const id = `teacher-${key.replace(/[^a-z0-9]/g, "-").slice(0, 60)}`;

    await prisma.ratingItem.upsert({
      where: { id },
      update: {
        name: teacher.name,
        department,
        email: teacher.email || null,
      },
      create: {
        id,
        category: RatingCategory.TEACHER,
        name: teacher.name,
        department,
        email: teacher.email || null,
        avatar: "",
      },
    });
    created++;
    if (teacher.email) withEmail++;
  }

  const total = await prisma.ratingItem.count({ where: { category: "TEACHER" } });
  console.log(`Created/updated: ${created} (${withEmail} with email, ${created - withEmail} without)`);
  console.log(`Total teachers in DB: ${total}`);

  // Sample
  const sampleWithEmail = await prisma.ratingItem.findMany({
    where: { category: "TEACHER", email: { not: null } },
    take: 3,
    orderBy: { name: "asc" },
  });
  console.log("\nSample (with email):");
  sampleWithEmail.forEach((t) => console.log(`  ${t.name} | ${t.email} | ${t.department}`));

  const sampleNoEmail = await prisma.ratingItem.findMany({
    where: { category: "TEACHER", OR: [{ email: null }, { email: "" }] },
    take: 3,
    orderBy: { name: "asc" },
  });
  console.log("\nSample (no email):");
  sampleNoEmail.forEach((t) => console.log(`  ${t.name} | (暂无邮箱) | ${t.department}`));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
