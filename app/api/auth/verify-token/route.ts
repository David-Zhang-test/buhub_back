import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function POST(req: NextRequest) {
  try {
    await getCurrentUser(req);
    return NextResponse.json({ valid: true });
  } catch (error) {
    return handleError(error);
  }
}
