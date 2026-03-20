import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { getMyRating } from "@/src/lib/ratings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);

    const { category, id } = await params;
    const data = await getMyRating(user.id, category, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error, req);
  }
}
