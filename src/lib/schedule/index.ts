// buhub_back/src/lib/schedule/index.ts
// Pipeline: CV (block detection) + OCR (text + positions) → Code (matching) → LLM (name/location)
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectText } from "./ocr";
import { detectColumnXRanges } from "./grouping";
import { detectCVBlocks } from "./cv-detect";
import type { ParsedCourse, CVBlock, OCRWord, TimeScaleEntry } from "./types";

export type { ParsedCourse } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.5-flash";
const DAY_KEYWORDS: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7,
};

function resolveImagePath(imageUrl: string): string | null {
  const m = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
  if (m) { const p = path.join(path.resolve(process.cwd(), "public/uploads"), m[1]); if (fs.existsSync(p)) return p; }
  if (imageUrl.startsWith("file://")) return imageUrl.replace("file://", "");
  if (imageUrl.startsWith("/") && fs.existsSync(imageUrl)) return imageUrl;
  return null;
}

function snapTo30(min: number): number { return Math.round(min / 30) * 30; }
function minutesToTime(min: number): string {
  const s = snapTo30(min);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function parseTime(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

function interpolateTime(y: number, ts: TimeScaleEntry[]): number {
  if (ts.length < 2) return 480; // default 08:00
  if (y <= ts[0].y) return parseTime(ts[0].time);
  if (y >= ts[ts.length - 1].y) return parseTime(ts[ts.length - 1].time);
  for (let i = 0; i < ts.length - 1; i++) {
    if (y >= ts[i].y && y <= ts[i + 1].y) {
      const ratio = (y - ts[i].y) / (ts[i + 1].y - ts[i].y);
      return parseTime(ts[i].time) + ratio * (parseTime(ts[i + 1].time) - parseTime(ts[i].time));
    }
  }
  return parseTime(ts[0].time);
}

function dedup(courses: ParsedCourse[]): ParsedCourse[] {
  const merged = new Map<string, ParsedCourse>();
  for (const c of courses) {
    const key = `${c.name}|${c.dayOfWeek}|${c.startTime}|${c.endTime}`;
    const existing = merged.get(key);
    if (existing) {
      if (c.location && !existing.location.includes(c.location))
        existing.location = existing.location ? `${existing.location}, ${c.location}` : c.location;
    } else merged.set(key, { ...c });
  }
  return Array.from(merged.values());
}

function mergeSameName(courses: ParsedCourse[]): ParsedCourse[] {
  const groups = new Map<string, ParsedCourse[]>();
  for (const c of courses) {
    const key = `${c.name}|${c.dayOfWeek}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const result: ParsedCourse[] = [];
  for (const [, group] of groups) {
    group.sort((a, b) => a.startTime.localeCompare(b.startTime));
    let cur = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      const next = group[i];
      if (cur.endTime >= next.startTime) {
        if (next.endTime > cur.endTime) cur.endTime = next.endTime;
        const locs = new Set(cur.location.split(", ").filter(Boolean));
        for (const l of next.location.split(", ").filter(Boolean)) locs.add(l);
        cur.location = Array.from(locs).join(", ");
      } else { result.push(cur); cur = { ...next }; }
    }
    result.push(cur);
  }
  return result;
}

// ─── LLM: identify course name + location from text ──────────────────────────

async function identifyCoursesLLM(
  cards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[]
): Promise<ParsedCourse[]> {
  if (cards.length === 0) return [];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const formatted = cards.map((c, i) =>
    `Card ${i + 1} (${dayNames[c.dayOfWeek]}, dayOfWeek=${c.dayOfWeek}, ${c.startTime}-${c.endTime}):\n  ${c.texts.join("\n  ")}`
  ).join("\n\n");

  const prompt = `Parse these timetable cards into course records.
Each card has dayOfWeek, startTime, endTime ALREADY DETERMINED. DO NOT change them — copy exactly.

Your ONLY job: identify which text is a course code and which is a location.
- Course codes: 2-5 uppercase letters + 4 digits (COMP3115, GCAP3105)
- Strip brackets: "GCAP3105 (00001)" → "GCAP3105"
- Locations: room codes (JC3_UG05, LMC512, FSC801C). Multiple rooms → comma-separated.
- If no course code found, skip the card.

Data:
${formatted}

Output: JSON array only.
[{"name":"GCAP3105","location":"JC3_UG05","dayOfWeek":4,"startTime":"09:30","endTime":"12:30"}]`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL, messages: [{ role: "user", content: prompt }],
      max_tokens: 4096, temperature: 0,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`LLM error ${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim() || "";

  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (!arrMatch) return [];
  try {
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => ({
      name: String(item.name || "").replace(/\s*\([^)]*\)\s*/g, "").trim(),
      location: String(item.location || ""),
      dayOfWeek: Math.min(7, Math.max(1, Number(item.dayOfWeek) || 1)),
      startTime: String(item.startTime || "08:00"),
      endTime: String(item.endTime || "09:00"),
    })).filter((c: ParsedCourse) => c.name.length > 0);
  } catch { return []; }
}

// ─── Build time scale from OCR words ─────────────────────────────────────────

function buildTimeScale(words: OCRWord[], imageWidth: number): { timeScale: TimeScaleEntry[]; timeColumnMaxX: number } {
  const timePat = /^\d{1,2}(:\d{2})?$/;
  const allTimeWords = words.filter(w => timePat.test(w.text.trim()));
  if (allTimeWords.length < 3) return { timeScale: [], timeColumnMaxX: 0 };

  const sorted = [...allTimeWords].sort((a, b) => a.bounds.x - b.bounds.x);
  const leftX = sorted[0].bounds.x;
  const colWords = sorted.filter(w => Math.abs(w.bounds.x - leftX) < imageWidth * 0.05);
  const timeColumnMaxX = Math.max(...colWords.map(w => w.bounds.x + w.bounds.width));

  const timeScale: TimeScaleEntry[] = [];
  for (const w of colWords) {
    const m = w.text.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (m) {
      const h = Number(m[1]), min = Number(m[2] || 0);
      if (h >= 0 && h <= 23) timeScale.push({ y: w.bounds.y + w.bounds.height / 2, time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` });
    }
  }
  timeScale.sort((a, b) => a.y - b.y);

  // Dedup
  const deduped: TimeScaleEntry[] = [];
  for (const e of timeScale) if (!deduped.find(d => d.time === e.time)) deduped.push(e);

  // Interpolate missing hours (integer format only)
  if (!deduped.some(d => d.time.endsWith(":30")) && deduped.length >= 2) {
    const firstH = parseInt(deduped[0].time); const lastH = parseInt(deduped[deduped.length - 1].time);
    const pxPerH = (deduped[deduped.length - 1].y - deduped[0].y) / (lastH - firstH);
    for (let h = firstH; h <= lastH; h++) {
      const ts = `${String(h).padStart(2, "0")}:00`;
      if (!deduped.find(d => d.time === ts)) deduped.push({ y: deduped[0].y + (h - firstH) * pxPerH, time: ts });
    }
    deduped.sort((a, b) => a.y - b.y);
  }

  return { timeScale: deduped, timeColumnMaxX };
}

// ─── Detect day headers from OCR words ───────────────────────────────────────

function detectHeaders(words: OCRWord[], imageHeight: number): { dayOfWeek: number; xCenter: number }[] {
  const region = imageHeight * 0.18;
  const headers: { dayOfWeek: number; xCenter: number }[] = [];
  for (const w of words) {
    if (w.bounds.y > region) continue;
    const key = w.text.trim().toLowerCase();
    if (DAY_KEYWORDS[key] !== undefined) headers.push({ dayOfWeek: DAY_KEYWORDS[key], xCenter: w.bounds.x + w.bounds.width / 2 });
  }
  return headers.sort((a, b) => a.xCenter - b.xCenter);
}

// ─── Assign dayOfWeek to a CV block using headers or grid position ───────────

function assignDayOfWeek(
  cvBlock: CVBlock,
  headers: { dayOfWeek: number; xCenter: number }[],
  timeColumnMaxX: number,
  imageWidth: number
): number {
  const blockCenterX = cvBlock.x + cvBlock.width / 2;

  if (headers.length >= 2) {
    // Find nearest header by x distance
    let best = headers[0];
    let bestDist = Infinity;
    for (const h of headers) {
      const d = Math.abs(blockCenterX - h.xCenter);
      if (d < bestDist) { bestDist = d; best = h; }
    }
    return best.dayOfWeek;
  }

  // No headers: sequential from left (1=Mon, 2=Tue...)
  // Will be overridden by sharp synthetic headers in caller
  return 1;
}

// ─── Main: CV-first pipeline ─────────────────────────────────────────────────

export async function parseScheduleImage(imageUrl: string): Promise<ParsedCourse[]> {
  // Step 1: OCR — get all text + positions + time scale
  const ocrResult = await detectText(imageUrl);
  const { words, imageWidth, imageHeight } = ocrResult;
  if (words.length === 0) return [];

  const { timeScale, timeColumnMaxX } = buildTimeScale(words, imageWidth);
  const hasTimeScale = timeScale.length >= 3;

  // Detect day headers
  let headers = detectHeaders(words, imageHeight);

  // Step 2: CV — detect colored course blocks (if local image)
  const imgPath = resolveImagePath(imageUrl);
  let cvBlocks: CVBlock[] = [];
  if (imgPath) {
    const cv = await detectCVBlocks(imgPath);
    cvBlocks = cv.blocks;
  }

  // If no headers, use sharp to inject synthetic headers (for column assignment)
  if (headers.length < 2 && cvBlocks.length >= 2) {
    try {
      const imgBuffer = fs.readFileSync(imgPath!);
      const meta = await sharp(imgBuffer).metadata();
      if (meta.width && meta.height) {
        const colRanges = await detectColumnXRanges(imgBuffer, meta.width, meta.height);
        if (colRanges.length >= 2) {
          const gridLeft = colRanges[0].xMin;
          const gridRight = colRanges[colRanges.length - 1].xMax;
          const gridWidth = gridRight - gridLeft;
          const avgW = colRanges.reduce((s, r) => s + (r.xMax - r.xMin), 0) / colRanges.length;
          let totalCols = 5;
          let bestFit = Infinity;
          for (const n of [5, 6]) { const f = Math.abs(avgW / (gridWidth / n) - 0.9); if (f < bestFit) { bestFit = f; totalCols = n; } }
          const colWidth = gridWidth / totalCols;
          const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          headers = colRanges.map(r => {
            const ci = Math.min(totalCols - 1, Math.max(0, Math.floor((r.xCenter - gridLeft) / colWidth)));
            return { dayOfWeek: ci + 1, xCenter: r.xCenter };
          });
        }
      }
    } catch { /* sharp failed */ }
  }

  // No time scale and no CV → fallback to Gemini vision
  if (!hasTimeScale && cvBlocks.length === 0) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
    const imgBuffer = imgPath ? fs.readFileSync(imgPath) : await (await fetch(imageUrl)).arrayBuffer().then(b => Buffer.from(b));
    const isPNG = imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50;
    const b64 = `data:${isPNG ? "image/png" : "image/jpeg"};base64,${imgBuffer.toString("base64")}`;
    const prompt = `Extract all courses from this timetable. dayOfWeek: Mon=1..Sun=7. Use 30-min granularity.
Output: JSON array only. [{"name":"GCAP3105","location":"JC3_UG05","dayOfWeek":4,"startTime":"09:30","endTime":"12:30"}]`;
    const resp = await fetch(OPENROUTER_API_URL, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: VISION_MODEL, messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: b64 } }, { type: "text", text: prompt },
      ]}], max_tokens: 4096, temperature: 0 }),
      signal: AbortSignal.timeout(90000),
    });
    if (!resp.ok) throw new Error(`Vision error ${resp.status}`);
    const r = await resp.json();
    const content = r.choices?.[0]?.message?.content?.trim() || "";
    const arr = content.match(/\[[\s\S]*\]/);
    if (!arr) return [];
    try {
      return JSON.parse(arr[0]).map((i: any) => ({
        name: String(i.name || "").replace(/\s*\([^)]*\)\s*/g, "").trim(),
        location: String(i.location || ""), dayOfWeek: Number(i.dayOfWeek) || 1,
        startTime: String(i.startTime || "08:00"), endTime: String(i.endTime || "09:00"),
      })).filter((c: any) => c.name);
    } catch { return []; }
  }

  // Step 3: Match OCR text to CV blocks → build cards with precise times
  if (cvBlocks.length > 0 && hasTimeScale) {
    // CV-first path: use CV blocks as course cards
    const cards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[] = [];

    for (const cvb of cvBlocks) {
      const dayOfWeek = assignDayOfWeek(cvb, headers, timeColumnMaxX, imageWidth);

      // startTime and endTime from CV block y-position + time scale (PRECISE)
      const startMin = snapTo30(interpolateTime(cvb.y, timeScale));
      const endMin = snapTo30(interpolateTime(cvb.y + cvb.height + cvb.height * 0.03, timeScale));
      if (endMin <= startMin) continue;

      const startTime = minutesToTime(startMin);
      const endTime = minutesToTime(endMin);

      // Find OCR words inside this CV block
      const textsInBlock: string[] = [];
      for (const w of words) {
        const wCenterX = w.bounds.x + w.bounds.width / 2;
        const wCenterY = w.bounds.y + w.bounds.height / 2;
        // Check if word center is inside the CV block (with some padding)
        const pad = 10;
        if (wCenterX >= cvb.x - pad && wCenterX <= cvb.x + cvb.width + pad &&
            wCenterY >= cvb.y - pad && wCenterY <= cvb.y + cvb.height + pad) {
          textsInBlock.push(w.text.trim());
        }
      }

      if (textsInBlock.length > 0) {
        cards.push({ dayOfWeek, startTime, endTime, texts: textsInBlock });
      }
    }

    if (cards.length > 0) {
      const courses = await identifyCoursesLLM(cards);
      return mergeSameName(dedup(courses));
    }
  }

  // Fallback: no CV blocks but has time scale → use OCR grouping + LLM
  const { groupDocBlocksIntoColumns, groupWordsIntoColumns } = await import("./grouping");
  const { parseColumnsWithTimeInference } = await import("./llm-parser");
  const { columns, timeScale: ts } = ocrResult.blocks.length > 0
    ? groupDocBlocksIntoColumns(ocrResult.blocks, words, imageWidth, imageHeight)
    : groupWordsIntoColumns(words, imageWidth, imageHeight);
  if (columns.length === 0) return [];
  const courses = await parseColumnsWithTimeInference(columns, ts);
  return mergeSameName(dedup(courses));
}
