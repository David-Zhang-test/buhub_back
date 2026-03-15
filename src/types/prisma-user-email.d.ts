import "@prisma/client";

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

declare module "@prisma/client" {
  interface PrismaClient {
    userEmail: UserEmailDelegate;
  }

  namespace Prisma {
    interface TransactionClient {
      userEmail: UserEmailDelegate;
    }
  }
}