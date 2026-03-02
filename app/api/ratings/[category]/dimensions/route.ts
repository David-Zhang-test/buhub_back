import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { getRatingDimensions } from "@/src/lib/ratings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await params;
    const data = await getRatingDimensions(category);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error, req);
  }
}
