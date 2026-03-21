import { prisma } from "@/src/lib/db";
import { detectContentLanguage, resolveAppLanguage, type AppLanguage } from "@/src/lib/language";

export type FunctionRefType = "partner" | "errand" | "secondhand" | "rating";

export type FunctionRefPayload = {
  type: FunctionRefType;
  id: string;
  title: string;
  ratingCategory?: string;
};

export type FunctionRefPreview = {
  entityType: FunctionRefType;
  entityId: string;
  title: string;
  sourceLanguage: AppLanguage;
  isFallback?: boolean;
};

const FUNCTION_REF_PREFIX = "[FUNC_REF]";

export function parseFunctionRef(content: string) {
  if (!content.startsWith(FUNCTION_REF_PREFIX)) {
    return { content, ref: null as FunctionRefPayload | null };
  }

  const newlineIndex = content.indexOf("\n");
  if (newlineIndex < 0) {
    return { content, ref: null as FunctionRefPayload | null };
  }

  const raw = content.slice(FUNCTION_REF_PREFIX.length, newlineIndex);
  const parsedContent = content.slice(newlineIndex + 1);

  try {
    const payload = JSON.parse(raw) as FunctionRefPayload;
    if (!payload?.type || !payload?.id || !payload?.title) {
      return { content: parsedContent, ref: null as FunctionRefPayload | null };
    }
    return { content: parsedContent, ref: payload };
  } catch {
    return { content: parsedContent, ref: null as FunctionRefPayload | null };
  }
}

function buildEntityKey(entityType: FunctionRefType, entityId: string) {
  return `${entityType}:${entityId}`;
}

function buildFallbackPreview(ref: FunctionRefPayload): FunctionRefPreview {
  return {
    entityType: ref.type,
    entityId: ref.id,
    title: ref.title,
    sourceLanguage: detectContentLanguage([ref.title], "tc"),
    isFallback: true,
  };
}

export async function resolveFunctionRefPreviews(
  refs: FunctionRefPayload[],
): Promise<Map<string, FunctionRefPreview>> {
  const deduped = Array.from(
    new Map(refs.map((ref) => [buildEntityKey(ref.type, ref.id), ref])).values(),
  );

  const partnerIds = deduped.filter((ref) => ref.type === "partner").map((ref) => ref.id);
  const errandIds = deduped.filter((ref) => ref.type === "errand").map((ref) => ref.id);
  const secondhandIds = deduped.filter((ref) => ref.type === "secondhand").map((ref) => ref.id);
  const ratingIds = deduped.filter((ref) => ref.type === "rating").map((ref) => ref.id);

  const [partners, errands, secondhandItems, ratings] = await Promise.all([
    partnerIds.length > 0
      ? prisma.partnerPost.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, title: true, sourceLanguage: true },
        })
      : Promise.resolve([]),
    errandIds.length > 0
      ? prisma.errand.findMany({
          where: { id: { in: errandIds } },
          select: { id: true, title: true, sourceLanguage: true },
        })
      : Promise.resolve([]),
    secondhandIds.length > 0
      ? prisma.secondhandItem.findMany({
          where: { id: { in: secondhandIds } },
          select: { id: true, title: true, sourceLanguage: true },
        })
      : Promise.resolve([]),
    ratingIds.length > 0
      ? prisma.ratingItem.findMany({
          where: { id: { in: ratingIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const previews = new Map<string, FunctionRefPreview>();

  partners.forEach((item) => {
    previews.set(buildEntityKey("partner", item.id), {
      entityType: "partner",
      entityId: item.id,
      title: item.title,
      sourceLanguage: detectContentLanguage([item.title], resolveAppLanguage(item.sourceLanguage)),
    });
  });

  errands.forEach((item) => {
    previews.set(buildEntityKey("errand", item.id), {
      entityType: "errand",
      entityId: item.id,
      title: item.title,
      sourceLanguage: detectContentLanguage([item.title], resolveAppLanguage(item.sourceLanguage)),
    });
  });

  secondhandItems.forEach((item) => {
    previews.set(buildEntityKey("secondhand", item.id), {
      entityType: "secondhand",
      entityId: item.id,
      title: item.title,
      sourceLanguage: detectContentLanguage([item.title], resolveAppLanguage(item.sourceLanguage)),
    });
  });

  ratings.forEach((item) => {
    previews.set(buildEntityKey("rating", item.id), {
      entityType: "rating",
      entityId: item.id,
      title: item.name,
      sourceLanguage: detectContentLanguage([item.name], "tc"),
    });
  });

  deduped.forEach((ref) => {
    const key = buildEntityKey(ref.type, ref.id);
    if (!previews.has(key)) {
      previews.set(key, buildFallbackPreview(ref));
    }
  });

  return previews;
}
