import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import nodePath from "path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Prevent directory traversal
  if (segments.some((s) => s.includes(".."))) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Invalid path" } },
      { status: 403 }
    );
  }

  const filePath = nodePath.join(process.cwd(), "public", "uploads", ...segments);
  const ext = nodePath.extname(filePath).toLowerCase();

  if (!MIME_TYPES[ext]) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Unsupported file type" } },
      { status: 403 }
    );
  }

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": MIME_TYPES[ext],
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "File not found" } },
      { status: 404 }
    );
  }
}
