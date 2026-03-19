import { AppError } from "@/src/lib/errors";
import { getVerifiedHkbuEmailForUser } from "@/src/lib/user-emails";

export const LIFE_HKBU_EMAIL_DOMAIN = "life.hkbu.edu.hk";
export const HKBU_EMAIL_REQUIRED_FOR_PUBLISH = "HKBU_EMAIL_REQUIRED_FOR_PUBLISH";

export function isLifeHkbuEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith(`@${LIFE_HKBU_EMAIL_DOMAIN}`);
}

function isPrivilegedRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "MODERATOR";
}

export function assertCanPublishCommunityContent(user: { email?: string | null }) {
  if (isLifeHkbuEmail(user.email)) {
    return;
  }

  throw new AppError(
    "Please register with an HKBU email to use this feature",
    403,
    HKBU_EMAIL_REQUIRED_FOR_PUBLISH
  );
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
