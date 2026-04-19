import { AppError } from "@/src/lib/errors";
import { getVerifiedHkbuEmailForUser } from "@/src/lib/user-emails";

export const LIFE_HKBU_EMAIL_DOMAIN = "life.hkbu.edu.hk";

export function isLifeHkbuEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith(`@${LIFE_HKBU_EMAIL_DOMAIN}`);
}

function isPrivilegedRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "MODERATOR";
}

export async function assertHasVerifiedHkbuEmail(user: {
  id: string;
  email?: string | null;
  role?: string | null;
}) {
  if (isPrivilegedRole(user.role)) {
    return;
  }

  if (isLifeHkbuEmail(user.email)) {
    return;
  }

  const linkedHkbuEmail = await getVerifiedHkbuEmailForUser(user.id);
  if (linkedHkbuEmail) {
    return;
  }

  throw new AppError(
    "Please bind an HKBU email before using this feature",
    403,
    "HKBU_EMAIL_REQUIRED"
  );
}

/** True when the user may use HKBU-gated features (DM eligibility, etc.). */
export async function userHasHkbuGatedAccess(
  userId: string,
  role?: string | null
): Promise<boolean> {
  if (isPrivilegedRole(role)) {
    return true;
  }
  return Boolean(await getVerifiedHkbuEmailForUser(userId));
}
