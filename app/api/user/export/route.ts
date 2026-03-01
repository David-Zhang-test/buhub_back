import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { createExportJob } from "@/src/services/export.service";
import { handleError } from "@/src/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const jobId = await createExportJob(user.id);
    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    return handleError(error);
  }
}
