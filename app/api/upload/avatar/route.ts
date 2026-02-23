import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const formData = await req.formData();
    const file = formData.get("avatar") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "No avatar file provided" } },
        { status: 400 }
      );
    }

    // Validate type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TYPE", message: "Invalid file type" } },
        { status: 400 }
      );
    }

    // Validate size (5MB max for avatars)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: { code: "TOO_LARGE", message: "File exceeds 5MB limit" } },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${user.id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");

    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, fileName), buffer);

    const url = `/uploads/avatars/${fileName}`;

    return NextResponse.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    return handleError(error);
  }
}
