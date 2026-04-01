import fs from "fs";
import type { ParsedCourse } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function detectMimeType(buf: Buffer): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

function isValidCourse(c: unknown): c is ParsedCourse {
  if (typeof c !== "object" || c === null) return false;
  const obj = c as Record<string, unknown>;
  return (
    typeof obj.name === "string" && obj.name.length > 0 &&
    typeof obj.location === "string" &&
    typeof obj.dayOfWeek === "number" && obj.dayOfWeek >= 1 && obj.dayOfWeek <= 7 &&
    typeof obj.startTime === "string" && /^\d{2}:\d{2}$/.test(obj.startTime) &&
    typeof obj.endTime === "string" && /^\d{2}:\d{2}$/.test(obj.endTime)
  );
}

async function getImageBase64(imageUrl: string, imgPath: string | null): Promise<{ base64: string; mimeType: string } | null> {
  if (imgPath) {
    try {
      const buf = fs.readFileSync(imgPath);
      return { base64: buf.toString("base64"), mimeType: detectMimeType(buf) };
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mimeType: detectMimeType(buf) };
  } catch {
    return null;
  }
}

export async function validateCoursesWithLLM(
  imageUrl: string,
  courses: ParsedCourse[],
  imgPath: string | null
): Promise<ParsedCourse[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[llm-validate] OPENROUTER_API_KEY not set — skipping LLM validation");
    return courses;
  }

  const image = await getImageBase64(imageUrl, imgPath);
  if (!image) {
    console.warn("[llm-validate] Could not load image — skipping LLM validation");
    return courses;
  }

  const dataUrl = `data:${image.mimeType};base64,${image.base64}`;

  const userPrompt = `I have a preliminary extraction from an HKBU course timetable image. Please verify and correct it.

HKBU rules:
- Course codes: [A-Z]{2,4}\\d{3,4} (e.g. COMP2112, BUS3456, SCIE1008)
- dayOfWeek: Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6 Sun=7
- startTime / endTime: "HH:mm" 24h format, always on :00 or :30 boundaries
- Duration: always integer hours (1h, 2h, or 3h) — endTime = startTime + N hours
- location: HKBU room code (e.g. AAB101, CVA203, OEM405, SCT307) or empty string ""

IMPORTANT: The dayOfWeek values below were computed from precise pixel positions and are generally CORRECT.
- The SAME course code CAN appear on DIFFERENT days (e.g. MATH2225 on both Tue and Wed is normal — university courses have multiple sessions per week)
- Do NOT move a course to a different day just because another session of the same course exists on another day
- Only change dayOfWeek if the course block is CLEARLY in a different column than what dayOfWeek indicates

Preliminary extraction (may have OCR errors):
${JSON.stringify(courses, null, 2)}

Looking at the image, please:
1. Fix any OCR errors in course codes or room numbers
2. Remove entries that don't correspond to real course blocks in the image
3. Add any course blocks visible in the image that are missing
4. PRESERVE the dayOfWeek from the extraction unless a course is clearly in the wrong column
5. Ensure NO two courses on the same day have overlapping time ranges
6. Each course must have integer-hour duration (1h, 2h, or 3h) — fix any that don't

Return ONLY a JSON array with objects: {"name": string, "location": string, "dayOfWeek": number, "startTime": string, "endTime": string}`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://uhub.help",
        "X-Title": "BUHUB Schedule Parser",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are an HKBU timetable extractor. Return ONLY a JSON array of course objects. No markdown, no explanation.",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: userPrompt },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[llm-validate] OpenRouter returned ${response.status} — using original courses`);
      return courses;
    }

    const data = await response.json() as unknown;
    const content = (data as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("[llm-validate] Empty LLM response — using original courses");
      return courses;
    }

    // Strip markdown fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) {
      console.warn("[llm-validate] LLM did not return an array — using original courses");
      return courses;
    }

    const validated = (parsed as unknown[]).filter(isValidCourse);
    if (validated.length === 0) {
      console.warn("[llm-validate] No valid courses in LLM response — using original courses");
      return courses;
    }

    return validated;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[llm-validate] LLM validation failed: ${msg} — using original courses`);
    return courses;
  }
}
