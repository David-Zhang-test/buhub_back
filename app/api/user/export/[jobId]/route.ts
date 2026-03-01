import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { getExportJobStatus } from "@/src/services/export.service";
import { handleError } from "@/src/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { jobId } = await params;
    const status = await getExportJobStatus(jobId, user.id);
    if (!status) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Export job not found" } },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      status: status.status,
      downloadPath: status.downloadPath,
    });
  } catch (error) {
    return handleError(error);
  }
}
