import { PrismaClient } from "@prisma/client";

type UserEmailRow = {
  id: string;
  userId: string;
  email: string;
  type: string;
  canLogin: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserEmailDelegate = {
  create(args: {
    data: {
      userId: string;
      email: string;
      type: string;
      canLogin?: boolean;
      verifiedAt?: Date | null;
    };
  }): Promise<UserEmailRow>;
  update(args: {
    where: { id: string };
    data: {
      type?: string;
      canLogin?: boolean;
      verifiedAt?: Date | null;
    };
  }): Promise<UserEmailRow>;
  delete(args: { where: { id: string } }): Promise<UserEmailRow>;
  deleteMany(args: { where: { userId: string } }): Promise<{ count: number }>;
};

type RawSqlClient = {
  $queryRaw: <T = unknown>(query: any, ...values: any[]) => Promise<T>;
  $transaction: (...args: any[]) => Promise<any>;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mapUserEmailRow(row: UserEmailRow): UserEmailRow {
  return {
    ...row,
    email: normalizeEmail(row.email),
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function createUserEmailDelegate(client: RawSqlClient): UserEmailDelegate {
  return {
    async create({ data }) {
      const rows = await client.$queryRaw<UserEmailRow[]>`
        INSERT INTO "UserEmail" ("id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${data.userId},
          ${normalizeEmail(data.email)},
          ${data.type},
          ${data.canLogin ?? true},
          ${data.verifiedAt ?? null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING "id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt"
      `;
      return mapUserEmailRow(rows[0]);
    },
    async update({ where, data }) {
      const rows = await client.$queryRaw<UserEmailRow[]>`
        UPDATE "UserEmail"
        SET
          "type" = COALESCE(${data.type ?? null}, "type"),
          "canLogin" = COALESCE(${data.canLogin ?? null}, "canLogin"),
          "verifiedAt" = COALESCE(${data.verifiedAt ?? null}, "verifiedAt"),
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${where.id}
        RETURNING "id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt"
      `;
      return mapUserEmailRow(rows[0]);
    },
    async delete({ where }) {
      const rows = await client.$queryRaw<UserEmailRow[]>`
        DELETE FROM "UserEmail"
        WHERE "id" = ${where.id}
        RETURNING "id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt"
      `;
      return mapUserEmailRow(rows[0]);
    },
    async deleteMany({ where }) {
      const rows = await client.$queryRaw<Array<{ count: number }>>`
        WITH deleted AS (
          DELETE FROM "UserEmail"
          WHERE "userId" = ${where.userId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS "count" FROM deleted
      `;
      return { count: Number(rows[0]?.count ?? 0) };
    },
  };
}

function wrapClientWithUserEmail<T extends RawSqlClient>(client: T): T & { userEmail: UserEmailDelegate } {
  return new Proxy(client as T & { userEmail: UserEmailDelegate }, {
    get(target, prop, receiver) {
      if (prop === "userEmail") {
        return createUserEmailDelegate(target);
      }
      if (prop === "$transaction") {
        const originalTransaction = (target as any).$transaction.bind(target) as (...args: any[]) => Promise<any>;
        return (...args: any[]) => {
          if (typeof args[0] === "function") {
            const [fn, options] = args;
            return originalTransaction(
              (tx: any) => fn(wrapClientWithUserEmail(tx as RawSqlClient)),
              options
            );
          }
          return originalTransaction(args[0], args[1]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: (PrismaClient & { userEmail: UserEmailDelegate }) | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DEBUG_PRISMA === "1" ? ["query", "error", "warn"] : ["error"],
  });

export const prisma = wrapClientWithUserEmail(basePrisma);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
