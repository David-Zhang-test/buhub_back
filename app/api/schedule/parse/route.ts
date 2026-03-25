import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError } from "@/src/lib/errors";
import { parseScheduleImage } from "@/src/lib/minimax";

const COURSE_COLORS = ["#FFF6D7", "#B2F2FF", "#F9E6FF", "#FFC0A6", "#D7FFE0", "#D7ECFF", "#FFE0E0", "#E0F0FF"];

function getCourseColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

export async function POST(req: NextRequest) {
  try {
    const { user: _user } = await getCurrentUser(req);
    const body = await req.json();
    const { imageUrl } = body as { imageUrl: string };

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "imageUrl is required" } },
        { status: 400 }
      );
    }

    const parsed = await parseScheduleImage(imageUrl);
    const courses = parsed.map((course) => ({
      ...course,
      color: getCourseColor(course.name),
    }));

    return NextResponse.json({ success: true, data: { courses } });
  } catch (error) {
    return handleError(error, req);
  }
}
