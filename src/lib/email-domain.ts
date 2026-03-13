import { AppError } from "@/src/lib/errors";

export const LIFE_HKBU_EMAIL_DOMAIN = "life.hkbu.edu.hk";
export const HKBU_EMAIL_REQUIRED_FOR_PUBLISH = "HKBU_EMAIL_REQUIRED_FOR_PUBLISH";

export function isLifeHkbuEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith(`@${LIFE_HKBU_EMAIL_DOMAIN}`);
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
