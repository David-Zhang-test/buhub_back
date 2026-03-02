import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { getRatingList } from "@/src/lib/ratings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await params;
    const sortMode = req.nextUrl.searchParams.get("sortMode");
    const data = await getRatingList(category, sortMode);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error, req);
  }
}
