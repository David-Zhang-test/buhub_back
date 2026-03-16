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

// ── HKBU / Hong Kong themed anonymous name pools ──

const ANONYMOUS_PREFIXES: LocalizedWord[] = [
  // HKBU buildings & campus
  { tc: "浸大", sc: "浸大", en: "BU" },
  { tc: "善衡", sc: "善衡", en: "Shaw" },
  { tc: "逸夫", sc: "逸夫", en: "RunRun" },
  { tc: "聯福", sc: "联福", en: "Union" },
  { tc: "偉衡", sc: "伟衡", en: "Lam" },
  { tc: "思齊", sc: "思齐", en: "SzeChai" },
  { tc: "永隆", sc: "永隆", en: "WingLung" },
  { tc: "校巴", sc: "校巴", en: "Shuttle" },
  { tc: "飯堂", sc: "饭堂", en: "Canteen" },
  { tc: "球場", sc: "球场", en: "Court" },
  { tc: "天橋", sc: "天桥", en: "Bridge" },
  { tc: "山路", sc: "山路", en: "Hill" },
  { tc: "宿舍", sc: "宿舍", en: "Hostel" },
  { tc: "圖書館", sc: "图书馆", en: "Library" },
  // HK districts & landmarks
  { tc: "九龍塘", sc: "九龙塘", en: "KLT" },
  { tc: "維港", sc: "维港", en: "Harbor" },
  { tc: "太平山", sc: "太平山", en: "Peak" },
  { tc: "天星", sc: "天星", en: "StarFerry" },
  { tc: "旺角", sc: "旺角", en: "MongKok" },
  { tc: "銅鑼灣", sc: "铜锣湾", en: "CWB" },
  { tc: "深水埗", sc: "深水埗", en: "SSP" },
  { tc: "尖沙咀", sc: "尖沙咀", en: "TST" },
  { tc: "西貢", sc: "西贡", en: "SaiKung" },
  { tc: "長洲", sc: "长洲", en: "CheungChau" },
  { tc: "大澳", sc: "大澳", en: "TaiO" },
  { tc: "南丫", sc: "南丫", en: "Lamma" },
  { tc: "石澳", sc: "石澳", en: "ShekO" },
  { tc: "大埔", sc: "大埔", en: "TaiPo" },
  { tc: "中環", sc: "中环", en: "Central" },
  { tc: "油麻地", sc: "油麻地", en: "YMT" },
];

const ANONYMOUS_SUFFIXES: LocalizedWord[] = [
  // Animals (cute/short)
  { tc: "喵", sc: "喵", en: "Cat" },
  { tc: "汪", sc: "汪", en: "Pup" },
  { tc: "鯨", sc: "鲸", en: "Whale" },
  { tc: "鷹", sc: "鹰", en: "Hawk" },
  { tc: "兔", sc: "兔", en: "Bunny" },
  { tc: "鹿", sc: "鹿", en: "Deer" },
  { tc: "狐", sc: "狐", en: "Fox" },
  { tc: "龍", sc: "龙", en: "Dragon" },
  { tc: "鶴", sc: "鹤", en: "Crane" },
  { tc: "熊", sc: "熊", en: "Bear" },
  { tc: "雀", sc: "雀", en: "Sparrow" },
  { tc: "蝶", sc: "蝶", en: "Butterfly" },
  { tc: "魚", sc: "鱼", en: "Fish" },
  { tc: "鴿", sc: "鸽", en: "Dove" },
  // Campus life characters
  { tc: "學霸", sc: "学霸", en: "Ace" },
  { tc: "書蟲", sc: "书虫", en: "Bookworm" },
  { tc: "夜貓", sc: "夜猫", en: "NightOwl" },
  { tc: "吃貨", sc: "吃货", en: "Foodie" },
  { tc: "跑者", sc: "跑者", en: "Runner" },
  { tc: "旅人", sc: "旅人", en: "Traveler" },
  { tc: "探險家", sc: "探险家", en: "Explorer" },
  { tc: "觀星人", sc: "观星人", en: "Stargazer" },
  { tc: "咖啡黨", sc: "咖啡党", en: "CoffeeFan" },
  { tc: "奶茶控", sc: "奶茶控", en: "MilkTea" },
  { tc: "散步人", sc: "散步人", en: "Stroller" },
  { tc: "行山友", sc: "行山友", en: "Hiker" },
  { tc: "追風人", sc: "追风人", en: "WindChaser" },
  { tc: "聽雨客", sc: "听雨客", en: "RainListener" },
  { tc: "釣魚佬", sc: "钓鱼佬", en: "Angler" },
  { tc: "車長", sc: "车长", en: "Driver" },
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

export function generateSeededAnonymousIdentity(userId: string, language: AppLanguage = "tc") {
  const seed = createSeedBuffer(`anon:${userId}`);
  const prefix = pickSeededValue(ANONYMOUS_PREFIXES, seed, 0);
  const suffix = pickSeededValue(ANONYMOUS_SUFFIXES, seed, 1);
  const names = buildLocalizedAnonymousNames(prefix, suffix);
  const avatar = pickSeededValue(ANONYMOUS_AVATAR_COLORS, seed, 2);

  return {
    name: names[language],
    names,
    avatar,
  };
}
