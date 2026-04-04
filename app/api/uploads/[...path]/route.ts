import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import nodePath from "path";
import {
  fetchUploadObjectFromS3,
  headS3UploadObject,
  isS3UploadsEnabled,
} from "@/src/lib/s3";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".caf": "audio/x-caf",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
};

const baseHeadersFor = (contentType: string) => ({
  "Content-Type": contentType,
  "Cache-Control": "public, max-age=86400",
  "Accept-Ranges": "bytes",
  "Content-Disposition": "inline",
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

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

  const objectKey = segments.join("/");
  const range = req.headers.get("range");

  try {
    const fileStat = await stat(filePath);
    const buffer = await readFile(filePath);
    const baseHeaders = { ...baseHeadersFor(MIME_TYPES[ext]) };

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes */${fileStat.size}`,
          },
        });
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : fileStat.size - 1;

      if (
        Number.isNaN(start)
        || Number.isNaN(end)
        || start < 0
        || end < start
        || start >= fileStat.size
      ) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes */${fileStat.size}`,
          },
        });
      }

      const chunk = buffer.subarray(start, Math.min(end + 1, buffer.length));
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${start}-${start + chunk.length - 1}/${fileStat.size}`,
        },
      });
    }

    return new NextResponse(buffer, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(fileStat.size),
      },
    });
  } catch {
    if (!isS3UploadsEnabled()) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "File not found" } },
        { status: 404 }
      );
    }

    const s3Result = await fetchUploadObjectFromS3(objectKey, range);
    if (!s3Result) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "File not found" } },
        { status: 404 }
      );
    }

    if (s3Result.status === 416) {
      const baseHeaders = { ...baseHeadersFor(MIME_TYPES[ext]) };
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${s3Result.totalSize}`,
        },
      });
    }

    const baseHeaders = { ...baseHeadersFor(s3Result.contentType) };

    if (s3Result.status === 200) {
      return new NextResponse(s3Result.body, {
        headers: {
          ...baseHeaders,
          "Content-Length": String(s3Result.contentLength),
        },
      });
    }

    return new NextResponse(s3Result.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(s3Result.body.length),
        "Content-Range": s3Result.contentRange,
      },
    });
  }
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (segments.some((s) => s.includes(".."))) {
    return new NextResponse(null, { status: 403 });
  }

  const filePath = nodePath.join(process.cwd(), "public", "uploads", ...segments);
  const ext = nodePath.extname(filePath).toLowerCase();

  if (!MIME_TYPES[ext]) {
    return new NextResponse(null, { status: 403 });
  }

  const objectKey = segments.join("/");

  try {
    const fileStat = await stat(filePath);
    return new NextResponse(null, {
      headers: {
        ...baseHeadersFor(MIME_TYPES[ext]),
        "Content-Length": String(fileStat.size),
      },
    });
  } catch {
    if (!isS3UploadsEnabled()) {
      return new NextResponse(null, { status: 404 });
    }
    const meta = await headS3UploadObject(objectKey);
    if (!meta) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(null, {
      headers: {
        ...baseHeadersFor(meta.contentType),
        "Content-Length": String(meta.contentLength),
      },
    });
  }
}
