// buhub_back/src/lib/schedule/index.ts
// Hybrid pipeline: OCR path (for images with headers) + Vision path (for no-header images)
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectText } from "./ocr";
import { groupWordsIntoCourseBlocks, detectBlockYRanges, detectColumnXRanges } from "./grouping";
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
  const magic = buffer.slice(0, 4);
  const isPNG = magic[0] === 0x89 && magic[1] === 0x50;
  const mime = isPNG ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function snapTo30(min: number): number {
  return Math.round(min / 30) * 30;
}

async function callVisionModel(apiKey: string, base64Image: string, prompt: string, maxTokens = 4096): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: base64Image } },
        { type: "text", text: prompt },
      ]}],
      max_tokens: maxTokens,
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

// ─── Path A: OCR Pipeline (for images WITH day headers) ──────────────────────

async function parseWithOCR(
  imageUrl: string,
  preloadedWords?: { words: import("./types").OCRWord[]; imageWidth: number; imageHeight: number }
): Promise<ParsedCourse[]> {
  console.log("[schedule] Using OCR pipeline");

  // Stage 1: OCR (skip if words already provided)
  const { words, imageWidth, imageHeight } = preloadedWords ?? await detectText(imageUrl);
  console.log(`[schedule] OCR: ${words.length} words (${imageWidth}x${imageHeight})`);
  if (words.length === 0) return [];

  // Stage 2: Grouping
  const blocks = groupWordsIntoCourseBlocks(words, imageWidth, imageHeight);
  console.log(`[schedule] Found ${blocks.length} course blocks`);
  if (blocks.length === 0) return [];

  // endTime comes from OCR grouping (nextBlockTopY for consecutive blocks, estimation for last blocks)

  // Stage 3: LLM semantic parsing
  const courses = await parseCourseBlocks(blocks);
  return dedup(courses);
}

// ─── Path B: Vision Per-Column Pipeline (for images WITHOUT headers) ─────────

async function parseWithVisionPerColumn(imageUrl: string): Promise<ParsedCourse[]> {
  console.log("[schedule] Using vision per-column pipeline (no headers)");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const imgBuffer = await getImageBuffer(imageUrl);
  const base64Image = imageToBase64(imgBuffer);
  const meta = await sharp(imgBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");

  // Detect time scale with OCR
  const { words } = await detectText(imageUrl);
  const timePattern = /^\d{1,2}(:\d{2})?$/;
  const timeWords = words.filter(w => timePattern.test(w.text.trim()));
  let hasTimeScale = false;
  let timeScaleInfo = "";
  if (timeWords.length >= 3) {
    const sorted = [...timeWords].sort((a, b) => a.bounds.x - b.bounds.x);
    const labels = sorted.filter(w => Math.abs(w.bounds.x - sorted[0].bounds.x) < meta.width! * 0.08)
      .map(w => w.text.trim()).filter(t => /^\d{1,2}(:\d{2})?$/.test(t));
    if (labels.length >= 3) {
      hasTimeScale = true;
      const isHalfHour = labels.some(l => l.includes(":30"));
      timeScaleInfo = `TIME SCALE: ${isHalfHour ? "half-hour" : "integer-hour"} format. Labels: ${labels.join(", ")}.`;
    }
  }

  // Detect columns with sharp
  const colRanges = await detectColumnXRanges(imgBuffer, meta.width, meta.height);
  if (colRanges.length < 2) {
    console.log("[schedule] Could not detect columns, falling back to full-image extraction");
    // Fallback: send full image to Gemini
    const prompt = buildFullImagePrompt(hasTimeScale, timeScaleInfo);
    const content = await callVisionModel(apiKey, base64Image, prompt);
    return dedup(parseVisionResponse(extractJSON(content)));
  }

  // Fit to 5 or 6 column grid
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

  // Map colored regions to grid columns
  const occupiedCols: { index: number; xMin: number; xMax: number }[] = [];
  for (const range of colRanges) {
    const colIndex = Math.min(totalCols - 1, Math.max(0, Math.floor((range.xCenter - gridLeft) / colWidth)));
    occupiedCols.push({
      index: colIndex + 1, // 1-based dayOfWeek
      xMin: gridLeft + colIndex * colWidth,
      xMax: gridLeft + (colIndex + 1) * colWidth,
    });
  }

  console.log(`[schedule] ${occupiedCols.length} occupied columns → days: [${occupiedCols.map(c => c.index).join(",")}]`);

  // Time scale strip width
  const timeScaleWidth = Math.max(0, Math.floor(gridLeft));

  // Extract each column in parallel
  const singleColPrompt = `Extract all courses from this single-column timetable image.
${hasTimeScale ? timeScaleInfo + "\nRead startTime and endTime from the scale." : "NO TIME SCALE. Estimate times from vertical position."}
RULES:
- Course codes: 2-5 uppercase letters + 4 digits
- Strip brackets: "GCAP3105 (00001)" → "GCAP3105"
- Preserve locations exactly
- Set dayOfWeek to 1 (placeholder)
- Use 30-minute granularity: "HH:mm" format
- SELF-CHECK: blocks of same height = same duration.
Output: JSON array only.
[{"name":"COMP3115","location":"FSC801C","dayOfWeek":1,"startTime":"08:30","endTime":"10:30"}]
Return [] if no courses.`;

  const columnResults = await Promise.all(
    occupiedCols.map(async (col) => {
      const colLeft = Math.max(0, Math.floor((col.xMin / meta.width!) * meta.width!));
      const colRight = Math.min(meta.width!, Math.ceil((col.xMax / meta.width!) * meta.width!));
      const colW = colRight - colLeft;
      const top = Math.floor(meta.height! * 0.10);
      const cropHeight = meta.height! - top;

      try {
        const timeStrip = timeScaleWidth > 0
          ? await sharp(imgBuffer).extract({ left: 0, top, width: timeScaleWidth, height: cropHeight }).png().toBuffer()
          : null;
        const colStrip = await sharp(imgBuffer).extract({ left: colLeft, top, width: colW, height: cropHeight }).png().toBuffer();

        const totalWidth = timeScaleWidth + colW;
        const compositeInputs: sharp.OverlayOptions[] = [];
        if (timeStrip) compositeInputs.push({ input: timeStrip, left: 0, top: 0 });
        compositeInputs.push({ input: colStrip, left: timeScaleWidth, top: 0 });

        const cropped = await sharp({
          create: { width: totalWidth, height: cropHeight, channels: 3, background: { r: 255, g: 255, b: 255 } }
        }).composite(compositeInputs).jpeg().toBuffer();

        const croppedBase64 = `data:image/jpeg;base64,${cropped.toString("base64")}`;
        console.log(`[schedule] Extracting column ${col.index}`);
        const content = await callVisionModel(apiKey, croppedBase64, singleColPrompt, 2048);
        const parsed = extractJSON(content);
        return parsed.map((item) => {
          const c = item as Record<string, unknown>;
          return {
            name: String(c.name || "").replace(/\s*\([^)]*\)\s*/g, "").trim(),
            location: String(c.location || ""),
            dayOfWeek: col.index,
            startTime: String(c.startTime || "08:00"),
            endTime: String(c.endTime || "09:00"),
          };
        }).filter(c => c.name.length > 0);
      } catch (err) {
        console.log(`[schedule] Column ${col.index} failed:`, err instanceof Error ? err.message : err);
        return [];
      }
    })
  );

  return dedup(columnResults.flat());
}

function buildFullImagePrompt(hasTimeScale: boolean, timeScaleInfo: string): string {
  return `Extract all courses from this timetable image.
${hasTimeScale ? timeScaleInfo : "NO TIME SCALE. Estimate from vertical positions."}
RULES:
- Course codes: 2-5 uppercase letters + 4 digits
- Strip brackets. Preserve locations.
- dayOfWeek: Mon=1..Sun=7. Assign by column position (leftmost=1).
- Use 30-minute granularity.
Output: JSON array only.
[{"name":"COMP3115","location":"FSC801C","dayOfWeek":4,"startTime":"08:30","endTime":"10:30"}]
Return [] if not a timetable.`;
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

// ─── Deduplication ───────────────────────────────────────────────────────────

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
  const result = Array.from(merged.values());
  console.log(`[schedule] Final: ${result.length} courses after dedup`);
  return result;
}

// ─── Main entry point: route to the best pipeline ────────────────────────────

export async function parseScheduleImage(imageUrl: string): Promise<ParsedCourse[]> {
  // OCR scan — used for routing AND as input to the pipeline
  console.log("[schedule] Stage 1: OCR text detection...");
  const ocrResult = await detectText(imageUrl);
  const words = ocrResult.words;
  console.log(`[schedule] OCR found ${words.length} words`);

  const DAY_KW = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "一", "二", "三", "四", "五", "六", "日"]);
  const hasHeaders = words.some(w => DAY_KW.has(w.text.trim().toLowerCase()));

  // Check for time scale labels (numbers at leftmost x-positions)
  const timePattern = /^\d{1,2}(:\d{2})?$/;
  const timeWords = words.filter(w => timePattern.test(w.text.trim()));
  const hasTimeScale = timeWords.length >= 3;

  if (hasHeaders && hasTimeScale) {
    // Best case: OCR for everything (deterministic, precise)
    return parseWithOCR(imageUrl, ocrResult);
  } else if (!hasHeaders && hasTimeScale) {
    // No headers but has time scale: OCR + sharp synthetic headers (deterministic)
    console.log("[schedule] No headers + has time scale: OCR + sharp column detection");
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
          console.log(`[schedule] Injected ${colRanges.length} synthetic headers → days: [${colRanges.map(r => {
            const ci = Math.min(totalCols - 1, Math.max(0, Math.floor((r.xCenter - gridLeft) / colWidth)));
            return ci + 1;
          }).join(",")}]`);
        }
      }
    } catch (err) {
      console.log("[schedule] Sharp failed:", err instanceof Error ? err.message : err);
    }
    return parseWithOCR(imageUrl, ocrResult);
  } else {
    // No time scale (with or without headers): Gemini vision
    console.log("[schedule] No time scale: using Gemini vision");
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
    const imgBuffer = await getImageBuffer(imageUrl);
    const base64 = imageToBase64(imgBuffer);
    const prompt = `Extract all courses from this timetable image.
${hasHeaders ? "Day headers are visible at the top. Use them for dayOfWeek." : "No day headers — assign dayOfWeek by column position: leftmost=Mon(1), next=Tue(2), etc."}
dayOfWeek: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7.
No time scale visible — estimate times from block vertical positions. Top of grid ≈ 08:00.
RULES:
- Course codes: 2-5 uppercase letters + 4 digits. Strip brackets.
- Preserve locations. Use 30-min granularity "HH:mm".
- For each block, look DIRECTLY ABOVE to find the day header (if visible).
- SELF-CHECK: same-height blocks = same duration.
Output: JSON array only.
[{"name":"GCAP3105","location":"JC3_UG05","dayOfWeek":4,"startTime":"09:30","endTime":"12:30"}]`;
    const content = await callVisionModel(apiKey, base64, prompt);
    return dedup(parseVisionResponse(extractJSON(content)));
  }
}
