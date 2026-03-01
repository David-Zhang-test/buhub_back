import { Prisma } from "@prisma/client";

const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRawInviteCode(): string {
  let result = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
    result += INVITE_CODE_CHARS[randomIndex];
  }
  return result;
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function createInviteCodesForUser(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  count: number
) {
  const createdCodes: string[] = [];

  for (let i = 0; i < count; i += 1) {
    let retries = 0;
    // Retry on random collisions to keep code format user-friendly.
    while (retries < 20) {
      const code = generateRawInviteCode();
      const exists = await tx.inviteCode.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!exists) {
        await tx.inviteCode.create({
          data: {
            code,
            ownerUserId,
          },
        });
        createdCodes.push(code);
        break;
      }

      retries += 1;
    }

    if (createdCodes.length !== i + 1) {
      throw new Error("Failed to generate unique invite code");
    }
  }

  return createdCodes;
}
