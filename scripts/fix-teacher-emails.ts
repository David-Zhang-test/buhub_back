/**
 * Fix teacher email mismatches in the database.
 *
 * Problems fixed:
 * 1. Wrong email assignments: emails that don't match the teacher's name
 *    (caused by broken positional pairing in the import script)
 * 2. Duplicate teacher records: same person with different name formats
 *    (e.g. "Mr Chan, Mandel W M" vs "Mandel W M CHAN")
 *
 * Run: cd buhub_back && npx tsx scripts/fix-teacher-emails.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract alphabetic name tokens (lowercased, min 2 chars) */
function nameTokens(name: string): string[] {
  return name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs|Miss)\s+/gi, "")
    .replace(/[,.()\-]/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Check if email username plausibly matches any token in the teacher name */
function emailMatchesName(email: string, name: string): boolean {
  const user = email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!user || user.length < 2) return false;
  const tokens = nameTokens(name);
  for (const tok of tokens) {
    if (user.includes(tok) || tok.includes(user)) return true;
  }
  return false;
}

/**
 * Score how well an email matches a name (higher = better match).
 * 0 = no match at all.
 */
function emailMatchScore(email: string, name: string): number {
  const user = email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!user || user.length < 2) return 0;
  const tokens = nameTokens(name);
  let score = 0;
  for (const tok of tokens) {
    if (user.includes(tok)) {
      // Bonus for longer token matches (e.g. "mandel" > "chan")
      score += tok.length;
    }
  }
  return score;
}

/** Normalize name to a canonical key for dedup: sorted tokens */
function canonicalKey(name: string): string {
  return nameTokens(name).sort().join(" ");
}

async function main() {
  const teachers = await prisma.ratingItem.findMany({
    where: { category: "TEACHER" },
    select: { id: true, name: true, email: true, department: true },
    orderBy: { name: "asc" },
  });

  console.log(`Total teachers: ${teachers.length}`);

  // ── Phase 1: Fix wrong email assignments ─────────────────────────
  let emailsNullified = 0;
  let emailsCorrect = 0;
  const mismatches: { name: string; email: string }[] = [];

  for (const t of teachers) {
    if (!t.email) continue;

    if (emailMatchesName(t.email, t.name)) {
      emailsCorrect++;
    } else {
      mismatches.push({ name: t.name, email: t.email });
      await prisma.ratingItem.update({
        where: { id: t.id },
        data: { email: null },
      });
      emailsNullified++;
    }
  }

  console.log(`\nPhase 1 — Email validation:`);
  console.log(`  Correct emails: ${emailsCorrect}`);
  console.log(`  Mismatched emails nullified: ${emailsNullified}`);

  if (mismatches.length > 0) {
    console.log(`\n  Sample mismatches cleared:`);
    for (const m of mismatches.slice(0, 10)) {
      console.log(`    ${m.name} had ${m.email}`);
    }
    if (mismatches.length > 10) console.log(`    ... and ${mismatches.length - 10} more`);
  }

  // ── Phase 2: Merge duplicate teacher records ──────────────────────
  // Group by canonical key (sorted name tokens)
  const groups = new Map<string, typeof teachers>();
  for (const t of teachers) {
    const key = canonicalKey(t.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  let mergedGroups = 0;
  let recordsRemoved = 0;

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    // Pick the best record to keep:
    // Prefer the one with a valid email, then the one with the longest/most formal name
    const refreshed = await Promise.all(
      group.map((g) => prisma.ratingItem.findUnique({ where: { id: g.id }, select: { id: true, name: true, email: true, department: true } }))
    );
    const valid = refreshed.filter((r): r is NonNullable<typeof r> => r !== null);
    if (valid.length <= 1) continue;

    const sorted = [...valid].sort((a, b) => {
      // Prefer one with email
      if (a.email && !b.email) return -1;
      if (!a.email && b.email) return 1;
      // Prefer longer name (more detail)
      return b.name.length - a.name.length;
    });

    const keep = sorted[0];
    const remove = sorted.slice(1);

    // Check if any of the to-be-removed records have ratings
    for (const r of remove) {
      const ratingCount = await prisma.rating.count({ where: { itemId: r.id } });
      if (ratingCount > 0) {
        // Move ratings to the kept record
        await prisma.rating.updateMany({
          where: { itemId: r.id },
          data: { itemId: keep.id },
        });
        console.log(`  Moved ${ratingCount} ratings from ${r.id} to ${keep.id}`);
      }
      await prisma.ratingItem.delete({ where: { id: r.id } });
      recordsRemoved++;
    }
    mergedGroups++;
  }

  console.log(`\nPhase 2 — Deduplication:`);
  console.log(`  Duplicate groups merged: ${mergedGroups}`);
  console.log(`  Redundant records removed: ${recordsRemoved}`);

  // ── Phase 3: Resolve remaining shared emails ────────────────────────
  // When two different teachers still share an email, the one with the
  // higher emailMatchScore keeps it; the other(s) get nullified.
  const remaining = await prisma.$queryRaw<{ email: string }[]>`
    SELECT email FROM "RatingItem"
    WHERE category = 'TEACHER' AND email IS NOT NULL
    GROUP BY email HAVING COUNT(*) > 1
  `;

  let sharedResolved = 0;
  for (const { email } of remaining) {
    const sharing = await prisma.ratingItem.findMany({
      where: { category: "TEACHER", email },
      select: { id: true, name: true, email: true },
    });
    if (sharing.length <= 1) continue;

    // Score each teacher against the email
    const scored = sharing.map((t) => ({ ...t, score: emailMatchScore(email, t.name) }));
    scored.sort((a, b) => b.score - a.score);

    // Best match keeps the email; rest get nullified
    const [best, ...losers] = scored;
    for (const loser of losers) {
      await prisma.ratingItem.update({
        where: { id: loser.id },
        data: { email: null },
      });
      console.log(`  ${loser.name} (score ${loser.score}) lost ${email} to ${best.name} (score ${best.score})`);
      sharedResolved++;
    }
  }

  console.log(`\nPhase 3 — Shared email resolution:`);
  console.log(`  Emails reassigned (nullified from weaker match): ${sharedResolved}`);

  // ── Summary ───────────────────────────────────────────────────────
  const finalCount = await prisma.ratingItem.count({ where: { category: "TEACHER" } });
  const withEmail = await prisma.ratingItem.count({
    where: { category: "TEACHER", email: { not: null } },
  });
  const sharedEmails = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM (
      SELECT email FROM "RatingItem"
      WHERE category = 'TEACHER' AND email IS NOT NULL
      GROUP BY email HAVING COUNT(*) > 1
    ) sub
  `;

  console.log(`\nFinal state:`);
  console.log(`  Total teachers: ${finalCount}`);
  console.log(`  With email: ${withEmail}`);
  console.log(`  Shared email groups: ${Number(sharedEmails[0]?.count || 0)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
