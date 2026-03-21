import crypto from "crypto";
import { prisma } from "@/src/lib/db";
import { AppError, NotFoundError, ValidationError } from "@/src/lib/errors";
import { detectContentLanguage, resolveAppLanguage, type AppLanguage } from "@/src/lib/language";

export type ContentEntityType = "post" | "comment" | "partner" | "errand" | "secondhand" | "rating";

type TranslationFieldMap = Record<string, string>;

type ResolvedEntityContent = {
  sourceLanguage: AppLanguage;
  fields: TranslationFieldMap;
};

type ResolveTranslationParams = {
  entityType: ContentEntityType;
  entityId: string;
  targetLanguage: AppLanguage;
};

type ResolveBatchTranslationParams = {
  items: Array<{
    entityType: ContentEntityType;
    entityId: string;
  }>;
  targetLanguage: AppLanguage;
};

type ModelTranslationResponse = {
  sourceLanguage: AppLanguage;
  items: Array<{
    fieldName: string;
    translatedText: string;
  }>;
};

const AZURE_TRANSLATOR_ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT?.trim().replace(/\/$/, "");
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY?.trim();
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION?.trim();
const AZURE_TRANSLATOR_API_VERSION = "3.0";
const TRANSLATION_PROVIDER_MODEL = "azure-translator";
const FUNCTION_REF_PREFIX = "[FUNC_REF]";

function buildSourceHash(sourceLanguage: AppLanguage, value: string) {
  return crypto.createHash("sha256").update(`${sourceLanguage}:${value}`).digest("hex");
}

function compactFields(fields: TranslationFieldMap): TranslationFieldMap {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  );
}

function stripFunctionRef(content: string) {
  if (!content.startsWith(FUNCTION_REF_PREFIX)) {
    return content;
  }

  const newlineIndex = content.indexOf("\n");
  if (newlineIndex < 0) {
    return content;
  }

  return content.slice(newlineIndex + 1);
}

function toAzureLanguage(language: AppLanguage) {
  if (language === "tc") return "zh-Hant";
  if (language === "sc") return "zh-Hans";
  return "en";
}

function buildAzureTranslateUrl(endpoint: string, query: URLSearchParams) {
  const host = new URL(endpoint).hostname.toLowerCase();
  const path =
    host === "api.cognitive.microsofttranslator.com"
      ? "/translate"
      : "/translator/text/v3.0/translate";
  return `${endpoint}${path}?${query.toString()}`;
}

async function loadEntityContent(entityType: ContentEntityType, entityId: string): Promise<ResolvedEntityContent> {
  switch (entityType) {
    case "post": {
      const post = await prisma.post.findFirst({
        where: { id: entityId, isDeleted: false },
        select: { sourceLanguage: true, content: true },
      });
      if (!post) throw new NotFoundError("Post not found");
      const fields = compactFields({ content: stripFunctionRef(post.content) });
      return {
        sourceLanguage: detectContentLanguage(Object.values(fields), resolveAppLanguage(post.sourceLanguage)),
        fields,
      };
    }
    case "comment": {
      const comment = await prisma.comment.findFirst({
        where: { id: entityId, isDeleted: false },
        select: { sourceLanguage: true, content: true },
      });
      if (!comment) throw new NotFoundError("Comment not found");
      const fields = compactFields({ content: comment.content });
      return {
        sourceLanguage: detectContentLanguage(Object.values(fields), resolveAppLanguage(comment.sourceLanguage)),
        fields,
      };
    }
    case "partner": {
      const partner = await prisma.partnerPost.findUnique({
        where: { id: entityId },
        select: {
          sourceLanguage: true,
          title: true,
          description: true,
          time: true,
          location: true,
        },
      });
      if (!partner) throw new NotFoundError("Partner post not found");
      const fields = compactFields({
        title: partner.title,
        description: partner.description,
        time: partner.time,
        location: partner.location,
      });
      return {
        sourceLanguage: detectContentLanguage(Object.values(fields), resolveAppLanguage(partner.sourceLanguage)),
        fields,
      };
    }
    case "errand": {
      const errand = await prisma.errand.findUnique({
        where: { id: entityId },
        select: {
          sourceLanguage: true,
          title: true,
          description: true,
          from: true,
          to: true,
          item: true,
          time: true,
        },
      });
      if (!errand) throw new NotFoundError("Errand not found");
      const fields = compactFields({
        title: errand.title,
        description: errand.description,
        from: errand.from,
        to: errand.to,
        item: errand.item,
        time: errand.time,
      });
      return {
        sourceLanguage: detectContentLanguage(Object.values(fields), resolveAppLanguage(errand.sourceLanguage)),
        fields,
      };
    }
    case "secondhand": {
      const item = await prisma.secondhandItem.findUnique({
        where: { id: entityId },
        select: {
          sourceLanguage: true,
          title: true,
          description: true,
          location: true,
        },
      });
      if (!item) throw new NotFoundError("Secondhand item not found");
      const fields = compactFields({
        title: item.title,
        description: item.description,
        location: item.location,
      });
      return {
        sourceLanguage: detectContentLanguage(Object.values(fields), resolveAppLanguage(item.sourceLanguage)),
        fields,
      };
    }
    case "rating": {
      const item = await prisma.ratingItem.findUnique({
        where: { id: entityId },
        select: {
          name: true,
        },
      });
      if (!item) throw new NotFoundError("Rating item not found");
      const fields = compactFields({
        name: item.name,
      });
      return {
        sourceLanguage: detectContentLanguage(Object.values(fields), "tc"),
        fields,
      };
    }
    default:
      throw new ValidationError("Unsupported entity type");
  }
}

async function requestModelTranslation(params: {
  entityType: ContentEntityType;
  sourceLanguage: AppLanguage;
  targetLanguage: AppLanguage;
  fields: TranslationFieldMap;
}): Promise<ModelTranslationResponse> {
  if (!AZURE_TRANSLATOR_ENDPOINT || !AZURE_TRANSLATOR_KEY) {
    throw new AppError(
      "AZURE_TRANSLATOR_ENDPOINT and AZURE_TRANSLATOR_KEY are required for translation",
      503,
      "TRANSLATION_UNAVAILABLE"
    );
  }

  const query = new URLSearchParams({
    "api-version": AZURE_TRANSLATOR_API_VERSION,
  });
  query.append("to", toAzureLanguage(params.targetLanguage));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": AZURE_TRANSLATOR_KEY,
  };

  if (AZURE_TRANSLATOR_REGION) {
    headers["Ocp-Apim-Subscription-Region"] = AZURE_TRANSLATOR_REGION;
  }

  const fieldEntries = Object.entries(params.fields);
  const response = await fetch(buildAzureTranslateUrl(AZURE_TRANSLATOR_ENDPOINT, query), {
    method: "POST",
    headers,
    body: JSON.stringify(fieldEntries.map(([, value]) => ({ text: value }))),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[translation] provider error", response.status, errorText);
    throw new AppError("Translation provider request failed", 502, "TRANSLATION_FAILED");
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    console.error("[translation] invalid response", payload);
    throw new AppError("Translation provider returned invalid data", 502, "TRANSLATION_FAILED");
  }

  return {
    sourceLanguage: params.sourceLanguage,
    items: fieldEntries.map(([fieldName, fallbackText], index) => {
      const translatedText = payload[index]?.translations?.[0]?.text;
      return {
        fieldName,
        translatedText:
          typeof translatedText === "string" && translatedText.trim().length > 0 ? translatedText : fallbackText,
      };
    }),
  };
}

export async function resolveEntityTranslation(params: ResolveTranslationParams) {
  const { entityType, entityId, targetLanguage } = params;
  const entity = await loadEntityContent(entityType, entityId);
  const fieldEntries = Object.entries(entity.fields);

  if (fieldEntries.length === 0) {
    return {
      entityType,
      entityId,
      sourceLanguage: entity.sourceLanguage,
      targetLanguage,
      fields: entity.fields,
    };
  }

  const fieldNames = fieldEntries.map(([fieldName]) => fieldName);
  const cachedTranslations = await prisma.contentTranslation.findMany({
    where: {
      entityType,
      entityId,
      targetLanguage,
      fieldName: { in: fieldNames },
    },
  });

  const translationByField = new Map(cachedTranslations.map((translation) => [translation.fieldName, translation]));
  const resolvedFields: TranslationFieldMap = {};
  const missingFields: TranslationFieldMap = {};

  for (const [fieldName, sourceValue] of fieldEntries) {
    const sourceHash = buildSourceHash(entity.sourceLanguage, sourceValue);
    const cached = translationByField.get(fieldName);
    if (cached && cached.sourceHash === sourceHash) {
      resolvedFields[fieldName] = cached.translatedText;
      continue;
    }
    missingFields[fieldName] = sourceValue;
  }

  if (Object.keys(missingFields).length > 0) {
    const translated = await requestModelTranslation({
      entityType,
      sourceLanguage: entity.sourceLanguage,
      targetLanguage,
      fields: missingFields,
    });

    const translatedFields = Object.fromEntries(
      translated.items
        .filter((item) => item.fieldName in missingFields)
        .map((item) => [item.fieldName, item.translatedText])
    );

    const completeFields = Object.keys(missingFields).map((fieldName) => {
      const fallback = missingFields[fieldName];
      return {
        fieldName,
        translatedText: translatedFields[fieldName] ?? fallback,
      };
    });

    await prisma.$transaction(
      completeFields.map(({ fieldName, translatedText }) =>
        prisma.contentTranslation.upsert({
          where: {
            entityType_entityId_fieldName_targetLanguage: {
              entityType,
              entityId,
              fieldName,
              targetLanguage,
            },
          },
          create: {
            entityType,
            entityId,
            fieldName,
            sourceLanguage: entity.sourceLanguage,
            targetLanguage,
            sourceHash: buildSourceHash(entity.sourceLanguage, missingFields[fieldName]),
            translatedText,
            model: TRANSLATION_PROVIDER_MODEL,
          },
          update: {
            sourceLanguage: entity.sourceLanguage,
            sourceHash: buildSourceHash(entity.sourceLanguage, missingFields[fieldName]),
            translatedText,
            status: "completed",
            model: TRANSLATION_PROVIDER_MODEL,
          },
        })
      )
    );

    for (const { fieldName, translatedText } of completeFields) {
      resolvedFields[fieldName] = translatedText;
    }
  }

  return {
    entityType,
    entityId,
    sourceLanguage: entity.sourceLanguage,
    targetLanguage,
    fields: resolvedFields,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function resolveEntityTranslationsBatch(params: ResolveBatchTranslationParams) {
  const dedupedItems = Array.from(
    new Map(
      params.items.map((item) => [`${item.entityType}:${item.entityId}`, item]),
    ).values(),
  );

  const results = await mapWithConcurrency(dedupedItems, 4, (item) =>
    resolveEntityTranslation({
      entityType: item.entityType,
      entityId: item.entityId,
      targetLanguage: params.targetLanguage,
    }),
  );

  return {
    items: results,
  };
}

export async function invalidateEntityTranslations(entityType: ContentEntityType, entityId: string) {
  await prisma.contentTranslation.deleteMany({
    where: {
      entityType,
      entityId,
    },
  });
}
