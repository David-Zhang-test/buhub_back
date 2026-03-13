import { createHash, randomInt } from "crypto";
import type { AppLanguage } from "@/src/lib/language";

const PROFILE_AVATAR_IDS = [
  "Harbour",
  "Beacon",
  "Willow",
  "Atlas",
  "Sora",
  "Juniper",
  "Tide",
  "Nova",
  "Cedar",
  "Marlow",
  "Aster",
  "Vale",
] as const;

const PROFILE_PREFIXES: Record<AppLanguage, string[]> = {
  tc: ["浸園", "善衡", "逸夫", "聯福", "校巴", "宿舍", "九塘", "天橋", "山路", "夜讀", "港風", "球場"],
  sc: ["浸园", "善衡", "逸夫", "联福", "校巴", "宿舍", "九塘", "天桥", "山路", "夜读", "港风", "球场"],
  en: ["Baptist", "Shaw", "Union", "Campus", "Shuttle", "Hostel", "Kowloon", "Bridge", "Hill", "Night", "Harbour", "Court"],
};

const PROFILE_SUFFIXES: Record<AppLanguage, string[]> = {
  tc: ["同學", "旅人", "路過生", "晨跑生", "書頁客", "小隊友", "夜航人", "球場友", "慢行者", "紙飛機", "散步人", "晴窗客"],
  sc: ["同学", "旅人", "路过生", "晨跑生", "书页客", "小队友", "夜航人", "球场友", "慢行者", "纸飞机", "散步人", "晴窗客"],
  en: ["Student", "Walker", "Traveler", "Runner", "Reader", "Teammate", "Night Owl", "Court Friend", "Stroller", "Paper Plane", "Window Seat", "Wayfarer"],
};

type LocalizedWord = Record<AppLanguage, string>;

const ANONYMOUS_PREFIXES: LocalizedWord[] = [
  { tc: "浸園", sc: "浸园", en: "Campus" },
  { tc: "善衡", sc: "善衡", en: "Shaw" },
  { tc: "逸夫", sc: "逸夫", en: "Shaw Hall" },
  { tc: "聯福", sc: "联福", en: "Union" },
  { tc: "校巴", sc: "校巴", en: "Shuttle" },
  { tc: "宿舍", sc: "宿舍", en: "Hostel" },
  { tc: "天橋", sc: "天桥", en: "Bridge" },
  { tc: "山路", sc: "山路", en: "Hill" },
  { tc: "夜讀", sc: "夜读", en: "Night" },
  { tc: "九塘", sc: "九塘", en: "Kowloon" },
  { tc: "海霧", sc: "海雾", en: "Harbor" },
  { tc: "港風", sc: "港风", en: "Breeze" },
  { tc: "雨巷", sc: "雨巷", en: "Rainlane" },
  { tc: "書頁", sc: "书页", en: "Paper" },
  { tc: "燈影", sc: "灯影", en: "Lantern" },
];

const ANONYMOUS_SUFFIXES: LocalizedWord[] = [
  { tc: "小狐", sc: "小狐", en: "Fox" },
  { tc: "旅鯨", sc: "旅鲸", en: "Whale" },
  { tc: "星貓", sc: "星猫", en: "Cat" },
  { tc: "紙舟", sc: "纸舟", en: "Boat" },
  { tc: "雲雀", sc: "云雀", en: "Lark" },
  { tc: "月羽", sc: "月羽", en: "Moonwing" },
  { tc: "燈潮", sc: "灯潮", en: "Glow" },
  { tc: "雨燕", sc: "雨燕", en: "Swift" },
  { tc: "潮聲", sc: "潮声", en: "Tide" },
  { tc: "晚風", sc: "晚风", en: "Wind" },
  { tc: "流螢", sc: "流萤", en: "Firefly" },
  { tc: "細浪", sc: "细浪", en: "Wave" },
];

const ANONYMOUS_AVATAR_COLORS = [
  "badge:book:harbor",
  "badge:bridge:dusk",
  "badge:bus:slate",
  "badge:leaf:moss",
  "badge:moon:harbor",
  "badge:lantern:brick",
  "badge:wave:jade",
] as const;

function createSeedBuffer(seedInput: string): Buffer {
  return createHash("sha256").update(seedInput).digest();
}

function pickSeededValue<T>(items: readonly T[], seed: Buffer, offset: number): T {
  return items[seed[offset % seed.length] % items.length];
}

function buildLocalizedAnonymousNames(prefix: LocalizedWord, suffix: LocalizedWord): Record<AppLanguage, string> {
  return {
    tc: `${prefix.tc}${suffix.tc}`,
    sc: `${prefix.sc}${suffix.sc}`,
    en: `${prefix.en} ${suffix.en}`,
  };
}

export function generateProfileIdentity(seedInput: string, language: AppLanguage = "tc") {
  const seed = createSeedBuffer(seedInput);
  const prefix = pickSeededValue(PROFILE_PREFIXES[language], seed, 0);
  const suffix = pickSeededValue(PROFILE_SUFFIXES[language], seed, 1);
  const avatarId = pickSeededValue(PROFILE_AVATAR_IDS, seed, 2);
  const discriminator = ((seed[3] << 8) | seed[4]) % 90 + 10;

  const nickname =
    language === "en"
      ? `${prefix} ${suffix} ${discriminator}`
      : `${prefix}${suffix}${discriminator}`;

  return {
    nickname,
    avatar: avatarId,
  };
}

export function generateLocalizedAnonymousIdentity(language: AppLanguage = "tc") {
  const prefix = ANONYMOUS_PREFIXES[randomInt(ANONYMOUS_PREFIXES.length)];
  const suffix = ANONYMOUS_SUFFIXES[randomInt(ANONYMOUS_SUFFIXES.length)];
  const names = buildLocalizedAnonymousNames(prefix, suffix);

  return {
    name: names[language],
    names,
    avatar: ANONYMOUS_AVATAR_COLORS[randomInt(ANONYMOUS_AVATAR_COLORS.length)],
  };
}
