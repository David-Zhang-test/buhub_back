import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/src/lib/auth";
import { getExportJobStatus, getExportZipPath } from "@/src/services/export.service";
import { handleError } from "@/src/lib/errors";

const EXPORT_DIR = path.join(process.cwd(), "public", "uploads", "export");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { jobId } = await params;

    const status = await getExportJobStatus(jobId, user.id);
    if (!status || status.status !== "ready") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Export not ready or not found" } },
        { status: 404 }
      );
    }

    const zipPath = getExportZipPath(user.id, jobId);
    if (!path.resolve(zipPath).startsWith(path.resolve(EXPORT_DIR))) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid path" } },
        { status: 403 }
      );
    }

    const buffer = await readFile(zipPath);
    const filename = `ulink-export-${jobId}.zip`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
