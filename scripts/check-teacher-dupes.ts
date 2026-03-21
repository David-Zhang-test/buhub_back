import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const teachers = await prisma.ratingItem.findMany({
    where: { category: "TEACHER" },
    select: { id: true, name: true, department: true, email: true },
  });

  // Exact name duplicates
  const nameMap = new Map<string, typeof teachers>();
  for (const t of teachers) {
    if (!nameMap.has(t.name)) nameMap.set(t.name, []);
    nameMap.get(t.name)!.push(t);
  }

  const exactDupes = [...nameMap.entries()].filter(([_, list]) => list.length > 1);
  console.log("Total teachers:", teachers.length);
  console.log("Unique exact names:", nameMap.size);
  console.log("Exact name duplicates:", exactDupes.length);

  for (const [name, list] of exactDupes) {
    console.log(`\n  "${name}" x${list.length}:`);
    for (const t of list) {
      console.log(`    id: ${t.id} | dept: ${t.department} | email: ${t.email || "(none)"}`);
    }
  }

  // Case-insensitive duplicates (different casing but same name)
  const ciMap = new Map<string, typeof teachers>();
  for (const t of teachers) {
    const key = t.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!ciMap.has(key)) ciMap.set(key, []);
    ciMap.get(key)!.push(t);
  }

  const ciDupes = [...ciMap.entries()].filter(([_, list]) => list.length > 1);
  const extraCiDupes = ciDupes.filter(([_, list]) => {
    const names = new Set(list.map((t) => t.name));
    return names.size > 1; // Only show if names differ in casing
  });

  if (extraCiDupes.length > 0) {
    console.log("\n\nCase-insensitive duplicates (different casing):");
    for (const [_, list] of extraCiDupes) {
      const names = [...new Set(list.map((t) => t.name))];
      console.log(`\n  ${names.map((n) => `"${n}"`).join(" vs ")}:`);
      for (const t of list) {
        console.log(`    id: ${t.id} | dept: ${t.department} | email: ${t.email || "(none)"}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
