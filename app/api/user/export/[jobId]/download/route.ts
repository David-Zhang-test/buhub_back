import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/src/lib/auth";
import { getExportJobStatus } from "@/src/services/export.service";
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
    if (!status || status.status !== "ready" || !status.downloadPath) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Export not ready or not found" } },
        { status: 404 }
      );
    }

    const filePath = path.join(process.cwd(), "public", status.downloadPath.replace(/^\//, ""));
    if (!filePath.startsWith(EXPORT_DIR)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid path" } },
        { status: 403 }
      );
    }

    const content = await readFile(filePath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="uhub-export-${jobId}.json"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
