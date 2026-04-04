/**
 * Verify UserEmail-centric auth helpers after seed-local-test-users.ts
 *
 *   cd buhub_back && npx tsx scripts/verify-user-email-model.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  findLoginIdentityByEmail,
  getLinkedEmailsForUser,
  hasVerifiedHkbuEmail,
  isEmailLinked,
  normalizeEmail,
} from "../src/lib/user-emails";
import { userHasHkbuGatedAccess } from "../src/lib/email-domain";

const prisma = new PrismaClient();

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function main() {
  const password = "TestPass123";

  // --- findLoginIdentityByEmail + password + verified gate (same rules as login route) ---
  const gmailOnly = await prisma.user.findFirst({ where: { userName: "test_gmail_only" } });
  if (!gmailOnly) fail("missing test_gmail_only — run seed-local-test-users.ts first");

  const idGmail = await findLoginIdentityByEmail("test.gmail.only@example.com");
  if (!idGmail?.linkedEmail?.verifiedAt) fail("gmail user should have verified linked email");
  if (!(await bcrypt.compare(password, idGmail.user.passwordHash!))) fail("password mismatch gmail");

  const hkbuOnly = await prisma.user.findFirst({ where: { userName: "test_hkbu_only" } });
  if (!hkbuOnly) fail("missing test_hkbu_only");
  const idHkbu = await findLoginIdentityByEmail("test.hkbu@life.hkbu.edu.hk");
  if (!idHkbu?.linkedEmail?.verifiedAt) fail("hkbu user verified");
  if (!(await hasVerifiedHkbuEmail(hkbuOnly.id))) fail("hasVerifiedHkbuEmail hkbu_only");

  const dual = await prisma.user.findFirst({ where: { userName: "test_dual_email" } });
  if (!dual) fail("missing test_dual_email");
  const dualList = await getLinkedEmailsForUser(dual.id);
  if (dualList.length !== 2) fail("dual user should have 2 UserEmail rows");
  const dualAddrs = new Set(dualList.map((e) => e.email));
  if (!dualAddrs.has(normalizeEmail("test.dual.primary@example.com"))) fail("dual missing primary");
  if (!dualAddrs.has(normalizeEmail("test.dual@life.hkbu.edu.hk"))) fail("dual missing hkbu");
  if (!(await hasVerifiedHkbuEmail(dual.id))) fail("dual should have verified hkbu");
  const idDualLogin = await findLoginIdentityByEmail("test.dual@life.hkbu.edu.hk");
  if (!idDualLogin || idDualLogin.user.id !== dual.id) fail("login via second email");

  const unver = await prisma.user.findFirst({ where: { userName: "test_unverified_extra" } });
  if (!unver) fail("missing test_unverified_extra");
  if (await hasVerifiedHkbuEmail(unver.id)) fail("unverified pending hkbu should not count as verified campus");

  // --- isEmailLinked ---
  if (!(await isEmailLinked("test.gmail.only@example.com"))) fail("isEmailLinked gmail");
  if (await isEmailLinked("nobody@example.com")) fail("isEmailLinked false positive");

  // --- gated access ---
  if (await userHasHkbuGatedAccess(gmailOnly.id, "USER")) fail("gmail only should NOT have campus access");
  if (!(await userHasHkbuGatedAccess(hkbuOnly.id, "USER"))) fail("hkbu should have access");
  if (!(await userHasHkbuGatedAccess(dual.id, "USER"))) fail("dual should have access");
  if (await userHasHkbuGatedAccess(unver.id, "USER")) fail("unver user should lack access");

  console.log("OK: all user-email / HKBU gate checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
