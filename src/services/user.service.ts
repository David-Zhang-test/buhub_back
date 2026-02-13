import { prisma } from "@/src/lib/db";
import { NotFoundError } from "@/src/lib/errors";

/**
 * Find user by userName or nickname (for public profile lookup)
 */
export async function findUserByHandle(handle: string) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ userName: handle }, { nickname: handle }],
      isActive: true,
      isBanned: false,
    },
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}
