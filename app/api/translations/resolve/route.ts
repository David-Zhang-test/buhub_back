import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { resolveAppLanguage } from "@/src/lib/language";
import { resolveTranslationSchema } from "@/src/schemas/translation.schema";
import { resolveEntityTranslation } from "@/src/services/translation.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = resolveTranslationSchema.parse(body);

    const result = await resolveEntityTranslation({
      entityType: data.entityType,
      entityId: data.entityId,
      targetLanguage: resolveAppLanguage(data.targetLanguage),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error, req);
  }
}
