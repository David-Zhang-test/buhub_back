import { prisma } from "@/src/lib/db";
import { AppError } from "@/src/lib/errors";

export const USER_EMAIL_TYPE_PRIMARY = "primary";
export const USER_EMAIL_TYPE_HKBU = "hkbu";
export const USER_EMAIL_MAX_COUNT = 2;

export type LinkedEmailRecord = {
  id: string;
  userId: string;
  email: string;
  type: string;
  canLogin: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
};

type RawDbExecutor = {
  $executeRaw: (...args: any[]) => Promise<number>;
  $queryRaw: <T = unknown>(query: any, ...values: any[]) => Promise<T>;
};

type RawLinkedEmailRow = {
  id: string;
  userId: string;
  email: string;
  type: string;
  canLogin: boolean;
  verifiedAt: Date | string | null;
  createdAt: Date | string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isHkbuEmailAddress(email: string): boolean {
  return normalizeEmail(email).endsWith("@life.hkbu.edu.hk");
}

function mapLinkedEmailRow(row: RawLinkedEmailRow): LinkedEmailRecord {
  return {
    id: row.id,
    userId: row.userId,
    email: normalizeEmail(row.email),
    type: row.type,
    canLogin: Boolean(row.canLogin),
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt) : null,
    createdAt: new Date(row.createdAt),
  };
}

export async function getLinkedEmailsForUser(userId: string): Promise<LinkedEmailRecord[]> {
  const rows = await prisma.$queryRaw<RawLinkedEmailRow[]>`
    SELECT "id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt"
    FROM "UserEmail"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" ASC
  `;
  return rows.map(mapLinkedEmailRow);
}

export async function getVerifiedHkbuEmailForUser(userId: string): Promise<LinkedEmailRecord | null> {
  const linkedEmails = await getLinkedEmailsForUser(userId);
  return linkedEmails.find((item) => Boolean(item.verifiedAt) && isHkbuEmailAddress(item.email)) ?? null;
}

export async function hasVerifiedHkbuEmail(userId: string): Promise<boolean> {
  const record = await getVerifiedHkbuEmailForUser(userId);
  return Boolean(record);
}

/** First linked email by createdAt — used as API "primary" / display email. */
export async function getPrimaryEmailForUser(userId: string): Promise<string | null> {
  const rows = await getLinkedEmailsForUser(userId);
  return rows[0]?.email ?? null;
}

async function findLinkedEmailRowByEmail(email: string): Promise<RawLinkedEmailRow | null> {
  const normalizedEmail = normalizeEmail(email);
  const rows = await prisma.$queryRaw<RawLinkedEmailRow[]>`
    SELECT "id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt"
    FROM "UserEmail"
    WHERE "email" = ${normalizedEmail}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findLoginIdentityByEmail(email: string) {
  const linkedRow = await findLinkedEmailRowByEmail(email);
  if (!linkedRow) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: linkedRow.userId },
  });
  if (!user) {
    return null;
  }
  const mapped = mapLinkedEmailRow(linkedRow);
  return {
    user,
    linkedEmail: {
      id: mapped.id,
      email: mapped.email,
      type: mapped.type,
      canLogin: mapped.canLogin,
      verifiedAt: mapped.verifiedAt,
    },
  };
}

export async function isEmailLinked(email: string): Promise<boolean> {
  const row = await findLinkedEmailRowByEmail(email);
  return row !== null;
}

export async function ensureUserCanLinkAnotherEmail(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "UserEmail"
    WHERE "userId" = ${userId}
  `;
  const currentCount = Number(rows[0]?.count ?? 0);
  if (currentCount >= USER_EMAIL_MAX_COUNT) {
    throw new AppError("You can link up to two emails", 400, "EMAIL_LIMIT_REACHED");
  }
}

export async function createUserEmail(
  db: RawDbExecutor,
  data: {
    userId: string;
    email: string;
    type: string;
    canLogin?: boolean;
    verifiedAt?: Date | null;
  }
) {
  const normalizedEmail = normalizeEmail(data.email);
  await db.$executeRaw`
    INSERT INTO "UserEmail" ("id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      ${data.userId},
      ${normalizedEmail},
      ${data.type},
      ${data.canLogin ?? true},
      ${data.verifiedAt ?? null},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;
}

export function serializeLinkedEmail(
  email: LinkedEmailRecord,
  primaryEmail: string | null | undefined
) {
  const normalizedPrimary = primaryEmail ? normalizeEmail(primaryEmail) : null;
  const emailType = isHkbuEmailAddress(email.email) ? USER_EMAIL_TYPE_HKBU : USER_EMAIL_TYPE_PRIMARY;
  return {
    id: email.id,
    email: email.email,
    type: emailType,
    canLogin: email.canLogin,
    verified: Boolean(email.verifiedAt),
    isPrimary: normalizedPrimary === normalizeEmail(email.email),
    createdAt: email.createdAt.toISOString(),
  };
}



