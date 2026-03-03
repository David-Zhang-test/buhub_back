import { randomInt } from "crypto";
import type { AppLanguage } from "@/src/lib/language";

export type AnonymousLocalizedNames = Record<AppLanguage, string>;

export type AnonymousIdentity = {
  name: string;
  avatar: string;
  names: AnonymousLocalizedNames;
  serializedName: string;
};

type AnonymousIdentitySource = {
  anonymousName?: string | null;
  anonymousAvatar?: string | null;
  authorId?: string | null;
};

type LocalizedWord = {
  tc: string;
  sc: string;
  en: string;
};

const ANONYMOUS_PREFIXES: LocalizedWord[] = [
  { tc: "\u975c\u591c", sc: "\u9759\u591c", en: "Silent" },
  { tc: "\u6708\u5f71", sc: "\u6708\u5f71", en: "Moon" },
  { tc: "\u6d41\u96f2", sc: "\u6d41\u4e91", en: "Cloud" },
  { tc: "\u9577\u6cb3", sc: "\u957f\u6cb3", en: "River" },
  { tc: "\u9752\u82d4", sc: "\u9752\u82d4", en: "Moss" },
  { tc: "\u9918\u71fc", sc: "\u4f59\u70ec", en: "Ember" },
  { tc: "\u6d6e\u5149", sc: "\u6d6e\u5149", en: "Drift" },
  { tc: "\u661f\u5c3e", sc: "\u661f\u5c3e", en: "Comet" },
  { tc: "\u67f3\u5f71", sc: "\u67f3\u5f71", en: "Willow" },
  { tc: "\u56de\u8072", sc: "\u56de\u58f0", en: "Echo" },
  { tc: "\u9727\u6e2f", sc: "\u96fe\u6e2f", en: "Harbor" },
  { tc: "\u5c71\u77f3", sc: "\u5c71\u77f3", en: "Stone" },
];

const ANONYMOUS_SUFFIXES: LocalizedWord[] = [
  { tc: "\u5c0f\u8c93", sc: "\u5c0f\u732b", en: "Cat" },
  { tc: "\u72d0\u72f8", sc: "\u72d0\u72f8", en: "Fox" },
  { tc: "\u9be8\u9b5a", sc: "\u9cb8\u9c7c", en: "Whale" },
  { tc: "\u98db\u9ce5", sc: "\u98de\u9e1f", en: "Bird" },
  { tc: "\u661f\u5b50", sc: "\u661f\u5b50", en: "Star" },
  { tc: "\u677e\u91dd", sc: "\u677e\u9488", en: "Pine" },
  { tc: "\u63d0\u71c8", sc: "\u63d0\u706f", en: "Lamp" },
  { tc: "\u7d30\u96e8", sc: "\u7ec6\u96e8", en: "Rain" },
  { tc: "\u79cb\u8449", sc: "\u79cb\u53f6", en: "Leaf" },
  { tc: "\u65c5\u72fc", sc: "\u65c5\u72fc", en: "Wolf" },
  { tc: "\u8c9d\u6bbc", sc: "\u8d1d\u58f3", en: "Shell" },
  { tc: "\u6eaa\u6d41", sc: "\u6eaa\u6d41", en: "Brook" },
];

const ANONYMOUS_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#F4A261",
  "#84A59D",
] as const;

const DEFAULT_ANONYMOUS_NAMES: AnonymousLocalizedNames = {
  tc: "\u533f\u540d\u65c5\u4eba",
  sc: "\u533f\u540d\u65c5\u4eba",
  en: "Anonymous Guest",
};

const DEFAULT_ANONYMOUS_AVATAR = "#84A59D";

const LEGACY_PREFIX_MAP = new Map(
  ANONYMOUS_PREFIXES.map((word) => [word.en.toLowerCase(), word] as const)
);

const LEGACY_SUFFIX_MAP = new Map(
  ANONYMOUS_SUFFIXES.map((word) => [word.en.toLowerCase(), word] as const)
);

function pickRandomValue<T>(items: readonly T[]): T {
  return items[randomInt(items.length)];
}

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

function buildLocalizedNames(prefix: LocalizedWord, suffix: LocalizedWord): AnonymousLocalizedNames {
  return {
    tc: `${prefix.tc}${suffix.tc}`,
    sc: `${prefix.sc}${suffix.sc}`,
    en: `${prefix.en} ${suffix.en}`,
  };
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

function parseLegacyEnglishName(name: string): AnonymousLocalizedNames | null {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const prefix = LEGACY_PREFIX_MAP.get(parts[0].toLowerCase());
  const suffix = LEGACY_SUFFIX_MAP.get(parts[1].toLowerCase());
  if (!prefix || !suffix) return null;

  return buildLocalizedNames(prefix, suffix);
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

  const legacyNames = parseLegacyEnglishName(sanitized);
  if (legacyNames) return legacyNames;

  return {
    tc: sanitized,
    sc: sanitized,
    en: sanitized,
  };
}

export function serializeAnonymousNames(names: AnonymousLocalizedNames): string {
  return JSON.stringify(names);
}

export function generateAnonymousIdentity(language: AppLanguage = "tc"): AnonymousIdentity {
  const prefix = pickRandomValue(ANONYMOUS_PREFIXES);
  const suffix = pickRandomValue(ANONYMOUS_SUFFIXES);
  const names = buildLocalizedNames(prefix, suffix);
  const avatar = pickRandomValue(ANONYMOUS_COLORS);

  return {
    name: names[language],
    avatar,
    names,
    serializedName: serializeAnonymousNames(names),
  };
}

export function resolveAnonymousIdentity(
  source: AnonymousIdentitySource,
  language: AppLanguage = "tc"
): AnonymousIdentity {
  const storedNames = parseStoredAnonymousNames(source.anonymousName) ?? DEFAULT_ANONYMOUS_NAMES;
  const storedAvatar = sanitizeAvatar(source.anonymousAvatar) ?? DEFAULT_ANONYMOUS_AVATAR;

  return {
    name: storedNames[language] ?? storedNames.tc ?? DEFAULT_ANONYMOUS_NAMES[language],
    avatar: storedAvatar,
    names: storedNames,
    serializedName: serializeAnonymousNames(storedNames),
  };
}
