import type { AppLanguage } from "@/src/lib/language";
import { generateSeededAnonymousIdentity } from "@/src/lib/profile-identity";

export type AnonymousLocalizedNames = Record<AppLanguage, string>;

export type AnonymousIdentity = {
  name: string;
  avatar: string;
  names: AnonymousLocalizedNames;
  serializedName: string;
};

export type AnonymousIdentitySource = {
  anonymousName?: string | null;
  anonymousAvatar?: string | null;
  authorId?: string | null;
};

const DEFAULT_ANONYMOUS_NAMES: AnonymousLocalizedNames = {
  tc: "\u533f\u540d\u65c5\u4eba",
  sc: "\u533f\u540d\u65c5\u4eba",
  en: "Anonymous Guest",
};

const DEFAULT_ANONYMOUS_AVATAR = "badge:moon:harbor";

function sanitizeName(name?: string | null): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAvatar(avatar?: string | null): string | null {
  if (typeof avatar !== "string") return null;
  const trimmed = avatar.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeLocalizedNamePayload(input: unknown): AnonymousLocalizedNames | null {
  if (!input || typeof input !== "object") return null;

  const names = {
    tc: sanitizeName((input as Record<string, unknown>).tc as string | null | undefined),
    sc: sanitizeName((input as Record<string, unknown>).sc as string | null | undefined),
    en: sanitizeName((input as Record<string, unknown>).en as string | null | undefined),
  };

  if (!names.tc && !names.sc && !names.en) {
    return null;
  }

  return {
    tc: names.tc ?? names.sc ?? names.en ?? DEFAULT_ANONYMOUS_NAMES.tc,
    sc: names.sc ?? names.tc ?? names.en ?? DEFAULT_ANONYMOUS_NAMES.sc,
    en: names.en ?? names.tc ?? names.sc ?? DEFAULT_ANONYMOUS_NAMES.en,
  };
}

function parseStoredAnonymousNames(rawName?: string | null): AnonymousLocalizedNames | null {
  const sanitized = sanitizeName(rawName);
  if (!sanitized) return null;

  if (sanitized.startsWith("{")) {
    try {
      return sanitizeLocalizedNamePayload(JSON.parse(sanitized));
    } catch {
      return null;
    }
  }

  return {
    tc: sanitized,
    sc: sanitized,
    en: sanitized,
  };
}

export function serializeAnonymousNames(names: AnonymousLocalizedNames): string {
  return JSON.stringify(names);
}

/**
 * Generate a deterministic anonymous identity for a user.
 * The same userId will always produce the same name and avatar.
 */
export function generateDeterministicAnonymousIdentity(
  userId: string,
  language: AppLanguage = "tc"
): AnonymousIdentity {
  const generated = generateSeededAnonymousIdentity(userId, language);
  return {
    name: generated.name,
    avatar: generated.avatar,
    names: generated.names,
    serializedName: serializeAnonymousNames(generated.names),
  };
}

export function resolveAnonymousIdentity(
  source: AnonymousIdentitySource,
  language: AppLanguage = "tc"
): AnonymousIdentity {
  const storedNames = parseStoredAnonymousNames(source.anonymousName) ?? DEFAULT_ANONYMOUS_NAMES;
  const storedAvatar = sanitizeAvatar(source.anonymousAvatar) ?? DEFAULT_ANONYMOUS_AVATAR;

  // Anonymous display names stay stable across viewer UI languages — pick a
  // canonical variant (tc → sc → en) so the label doesn't retranslate when the
  // reader switches their interface language.
  const stableName =
    storedNames.tc ?? storedNames.sc ?? storedNames.en ?? DEFAULT_ANONYMOUS_NAMES[language];

  return {
    name: stableName,
    avatar: storedAvatar,
    names: storedNames,
    serializedName: serializeAnonymousNames(storedNames),
  };
}
