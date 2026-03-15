import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { assertHasVerifiedHkbuEmail } from "@/src/lib/email-domain";
import { submitRatingSchema } from "@/src/schemas/rating.schema";
import { submitRatingForItem } from "@/src/lib/ratings";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    await assertHasVerifiedHkbuEmail(user);
    const { category, id } = await params;
    const body = await req.json();
    const data = submitRatingSchema.parse(body);
    const result = await submitRatingForItem(user.id, category, id, data);
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error, req);
  }
}
