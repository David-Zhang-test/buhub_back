import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { resolveAppLanguage } from "@/src/lib/language";
import { resolveTranslationsBatchSchema } from "@/src/schemas/translation.schema";
import { resolveEntityTranslationsBatch } from "@/src/services/translation.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = resolveTranslationsBatchSchema.parse(body);

    const result = await resolveEntityTranslationsBatch({
      items: data.items,
      targetLanguage: resolveAppLanguage(data.targetLanguage),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error, req);
  }
}
