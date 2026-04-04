import { AppError } from "@/src/lib/errors";
import { hasVerifiedHkbuEmail } from "@/src/lib/user-emails";

export const LIFE_HKBU_EMAIL_DOMAIN = "life.hkbu.edu.hk";

export function isLifeHkbuEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith(`@${LIFE_HKBU_EMAIL_DOMAIN}`);
}

function isPrivilegedRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "MODERATOR";
}

/**
 * Campus-wide gated features: posting, comments, repost, partner/errand/secondhand create,
 * ratings, and DMs. Allowed if the user is ADMIN/MODERATOR, or has a verified
 * @life.hkbu.edu.hk address among linked emails (UserEmail, max 2).
 */
export async function userHasHkbuGatedAccess(
  userId: string,
  role: string | null | undefined
): Promise<boolean> {
  if (isPrivilegedRole(role)) {
    return true;
  }
  return hasVerifiedHkbuEmail(userId);
}

export async function assertHasVerifiedHkbuEmail(user: {
  id: string;
  role?: string | null;
}) {
  if (await userHasHkbuGatedAccess(user.id, user.role)) {
    return;
  }

  throw new AppError(
    "Please bind an HKBU email before using this feature",
    403,
    "HKBU_EMAIL_REQUIRED"
  );
}
