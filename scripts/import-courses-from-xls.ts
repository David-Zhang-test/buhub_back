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

async function main() {
  const file = XLSX.readFile("/Users/krabbypatty/Desktop/UHUB-Development/docs/1.xls");
  const sheet = file.Sheets[file.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

  // Deduplicate by code
  const seen = new Set<string>();
  const courses = data.filter((r) => {
    const code = String(r["Course Code"] || "").trim();
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });

  console.log(`Importing ${courses.length} unique courses...`);

  let created = 0;
  for (const r of courses) {
    const code = String(r["Course Code"] || "").trim();
    const name = String(r["Course Title"] || "").trim();
    const prefix = code.match(/^[A-Z]+/)?.[0] || "";
    const department = PREFIX_DEPT[prefix] || "Hong Kong Baptist University";

    await prisma.ratingItem.upsert({
      where: { id: `course-${code}` },
      update: { name, department, code },
      create: {
        id: `course-${code}`,
        category: RatingCategory.COURSE,
        name,
        department,
        code,
        avatar: "",
      },
    });
    created++;
  }

  const total = await prisma.ratingItem.count({ where: { category: "COURSE" } });
  console.log(`Created/updated: ${created}`);
  console.log(`Total courses in DB: ${total}`);

  const sample = await prisma.ratingItem.findMany({
    where: { category: "COURSE" },
    take: 5,
    orderBy: { name: "asc" },
  });
  console.log("\nSample:");
  sample.forEach((c) => console.log(`  ${c.code} | ${c.name} | ${c.department}`));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
