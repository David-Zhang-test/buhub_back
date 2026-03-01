import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { consumeDownloadToken, getExportZipPath } from "@/src/services/export.service";
import { handleError } from "@/src/lib/errors";

const EXPORT_DIR = path.join(process.cwd(), "public", "uploads", "export");

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Missing token" } },
        { status: 400 }
      );
    }

    const payload = await consumeDownloadToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Invalid or expired download link" } },
        { status: 404 }
      );
    }

    const zipPath = getExportZipPath(payload.userId, payload.jobId);
    if (!path.resolve(zipPath).startsWith(path.resolve(EXPORT_DIR))) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Invalid path" } },
        { status: 403 }
      );
    }

    const buffer = await readFile(zipPath);
    const filename = `uhub-export-${payload.jobId}.zip`;
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
