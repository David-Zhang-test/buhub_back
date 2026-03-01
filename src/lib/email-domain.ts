const REQUIRED_EMAIL_DOMAIN = "life.hkbu.edu.hk";

export function isAllowedRegistrationEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${REQUIRED_EMAIL_DOMAIN}`);
}

export const allowedRegistrationEmailDomain = REQUIRED_EMAIL_DOMAIN;
