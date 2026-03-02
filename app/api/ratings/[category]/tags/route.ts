import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { getRatingTagOptions } from "@/src/lib/ratings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await params;
    const data = await getRatingTagOptions(category);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error, req);
  }
}
