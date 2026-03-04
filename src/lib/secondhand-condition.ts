import type { AppLanguage } from "@/src/lib/language";

export const SECONDHAND_CONDITION_LABELS: Record<
  "new" | "likeNew" | "good" | "fair",
  Record<AppLanguage, string>
> = {
  new: {
    tc: "全新",
    sc: "全新",
    en: "New",
  },
  likeNew: {
    tc: "95成新",
    sc: "95成新",
    en: "Like New",
  },
  good: {
    tc: "8成新",
    sc: "8成新",
    en: "Good",
  },
  fair: {
    tc: "7成新",
    sc: "7成新",
    en: "Fair",
  },
};

type SecondhandConditionKey = keyof typeof SECONDHAND_CONDITION_LABELS;

const CONDITION_ALIASES: Record<SecondhandConditionKey, string[]> = {
  new: ["new", "brand new", "brandnew", "全新", "全新未拆"],
  likeNew: ["likeNew", "like new", "95成新", "9成新", "九成新"],
  good: ["good", "8成新", "八成新"],
  fair: ["fair", "7成新", "七成新"],
};

const normalizeToken = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, "");

export function normalizeSecondhandCondition(
  value?: string | null
): SecondhandConditionKey | string {
  if (!value) return "";
  const normalizedValue = normalizeToken(value);

  for (const [condition, aliases] of Object.entries(CONDITION_ALIASES) as Array<
    [SecondhandConditionKey, string[]]
  >) {
    if (aliases.some((alias) => normalizeToken(alias) === normalizedValue)) {
      return condition;
    }
  }

  return value.trim();
}

export function localizeSecondhandCondition(
  value: string | null | undefined,
  language: AppLanguage
): string {
  const normalized = normalizeSecondhandCondition(value);
  if (normalized && normalized in SECONDHAND_CONDITION_LABELS) {
    return SECONDHAND_CONDITION_LABELS[normalized as SecondhandConditionKey][language];
  }
  return value?.trim() ?? "";
}
