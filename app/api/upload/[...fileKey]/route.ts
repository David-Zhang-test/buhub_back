import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ fileKey: string[] }> }
) {
  try {
    const { user } = await getCurrentUser(req);
    const { fileKey: segments } = await params;
    const fileKey = segments.join("/");

    if (!fileKey.startsWith(`uploads/${user.id}/`)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot delete this file" } },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
