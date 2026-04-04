import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/src/lib/errors";
import { getRatingCommentsPage } from "@/src/lib/ratings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; id: string }> }
) {
  try {
    const { category, id } = await params;
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "10");
    const data = await getRatingCommentsPage(category, id, page, limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error, req);
  }
}
