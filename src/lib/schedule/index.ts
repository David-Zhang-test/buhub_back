// buhub_back/src/lib/schedule/index.ts
// Hybrid pipeline: OCR (headers+timescale) | OCR+sharp (no headers) | Gemini vision (no timescale)
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectText } from "./ocr";
import { groupWordsIntoCourseBlocks, detectColumnXRanges } from "./grouping";
import { parseCourseBlocks } from "./llm-parser";
import type { ParsedCourse } from "./types";

export type { ParsedCourse } from "./types";

// ─── Shared helpers ──────────────────────────────────────────────────────────

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.5-flash";

async function getImageBuffer(imageUrl: string): Promise<Buffer> {
  const uploadsMatch = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
  if (uploadsMatch) {
    const filePath = path.join(path.resolve(process.cwd(), "public/uploads"), uploadsMatch[1]);
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  }
  if (imageUrl.startsWith("file://") || (imageUrl.startsWith("/") && fs.existsSync(imageUrl))) {
    return fs.readFileSync(imageUrl.replace("file://", ""));
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function imageToBase64(buffer: Buffer): string {
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
  return `data:${isPNG ? "image/png" : "image/jpeg"};base64,${buffer.toString("base64")}`;
}

async function callVisionModel(apiKey: string, base64Image: string, prompt: string): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: base64Image } },
        { type: "text", text: prompt },
      ]}],
      max_tokens: 4096,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Vision API error ${response.status}`);
  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() || "";
}

function extractJSON(content: string): unknown[] {
  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (!arrMatch) return [];
  try {
    const parsed = JSON.parse(arrMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function parseVisionResponse(parsed: unknown[]): ParsedCourse[] {
  return parsed.map((item) => {
    const c = item as Record<string, unknown>;
    return {
      name: String(c.name || "").replace(/\s*\([^)]*\)\s*/g, "").trim(),
      location: String(c.location || ""),
      dayOfWeek: Math.min(7, Math.max(1, Number(c.dayOfWeek) || 1)),
      startTime: String(c.startTime || "08:00"),
      endTime: String(c.endTime || "09:00"),
    };
  }).filter(c => c.name.length > 0);
}

function dedup(courses: ParsedCourse[]): ParsedCourse[] {
  const mergeKey = (c: ParsedCourse) => `${c.name}|${c.dayOfWeek}|${c.startTime}|${c.endTime}`;
  const merged = new Map<string, ParsedCourse>();
  for (const course of courses) {
    const key = mergeKey(course);
    const existing = merged.get(key);
    if (existing) {
      if (course.location && !existing.location.includes(course.location)) {
        existing.location = existing.location ? `${existing.location}, ${course.location}` : course.location;
      }
    } else {
      merged.set(key, { ...course });
    }
  }
  return Array.from(merged.values());
}

// ─── OCR Pipeline (for images with time scale) ──────────────────────────────

async function parseWithOCR(
  preloadedOCR: { words: import("./types").OCRWord[]; imageWidth: number; imageHeight: number }
): Promise<ParsedCourse[]> {
  const { words, imageWidth, imageHeight } = preloadedOCR;
  if (words.length === 0) return [];

  const blocks = groupWordsIntoCourseBlocks(words, imageWidth, imageHeight);
  if (blocks.length === 0) return [];

  const courses = await parseCourseBlocks(blocks);
  return dedup(courses);
}

// ─── Gemini Vision Fallback (for images without time scale) ──────────────────

async function parseWithVision(imageUrl: string, hasHeaders: boolean): Promise<ParsedCourse[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const imgBuffer = await getImageBuffer(imageUrl);
  const prompt = `Extract all courses from this timetable image.
${hasHeaders ? "Day headers are visible at the top. Use them for dayOfWeek." : "No day headers — assign dayOfWeek by column position: leftmost=Mon(1), next=Tue(2), etc."}
dayOfWeek: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7.
No time scale visible — estimate times from block vertical positions. Top of grid ≈ 08:00.
RULES:
- Course codes: 2-5 uppercase letters + 4 digits. Strip brackets.
- Preserve locations. Use 30-min granularity "HH:mm".
- SELF-CHECK: same-height blocks = same duration.
Output: JSON array only.
[{"name":"GCAP3105","location":"JC3_UG05","dayOfWeek":4,"startTime":"09:30","endTime":"12:30"}]`;

  const content = await callVisionModel(apiKey, imageToBase64(imgBuffer), prompt);
  return dedup(parseVisionResponse(extractJSON(content)));
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function parseScheduleImage(imageUrl: string): Promise<ParsedCourse[]> {
  // OCR scan — used for routing AND as pipeline input
  const ocrResult = await detectText(imageUrl);
  const words = ocrResult.words;

  if (words.length === 0) return [];

  // Detect features
  const DAY_KW = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "一", "二", "三", "四", "五", "六", "日"]);
  const hasHeaders = words.some(w => DAY_KW.has(w.text.trim().toLowerCase()));

  const topCutoff = ocrResult.imageHeight * 0.12;
  const timePat = /^\d{1,2}(:\d{2})?$/;
  const hasTimeScale = words.filter(w => timePat.test(w.text.trim()) && w.bounds.y > topCutoff).length >= 3;

  // Route to best pipeline
  if (hasTimeScale) {
    // Inject synthetic headers for no-header images using sharp column detection
    if (!hasHeaders) {
      try {
        const imgBuffer = await getImageBuffer(imageUrl);
        const meta = await sharp(imgBuffer).metadata();
        if (meta.width && meta.height) {
          const colRanges = await detectColumnXRanges(imgBuffer, meta.width, meta.height);
          if (colRanges.length >= 2) {
            const gridLeft = colRanges[0].xMin;
            const gridRight = colRanges[colRanges.length - 1].xMax;
            const gridWidth = gridRight - gridLeft;
            const avgWidth = colRanges.reduce((s, r) => s + (r.xMax - r.xMin), 0) / colRanges.length;
            let totalCols = 5;
            let bestFit = Infinity;
            for (const n of [5, 6]) {
              const fit = Math.abs(avgWidth / (gridWidth / n) - 0.9);
              if (fit < bestFit) { bestFit = fit; totalCols = n; }
            }
            const colWidth = gridWidth / totalCols;
            const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            for (const range of colRanges) {
              const colIndex = Math.min(totalCols - 1, Math.max(0, Math.floor((range.xCenter - gridLeft) / colWidth)));
              words.push({ text: dayNames[colIndex], bounds: { x: range.xCenter - 20, y: 5, width: 40, height: 15 } });
            }
          }
        }
      } catch { /* sharp failed, OCR will use x-clustering fallback */ }
    }
    return parseWithOCR(ocrResult);
  } else {
    // No time scale — Gemini vision estimates times from block positions
    return parseWithVision(imageUrl, hasHeaders);
  }
}
