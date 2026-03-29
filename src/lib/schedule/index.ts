// buhub_back/src/lib/schedule/index.ts
// Pipeline: CV (block detection) + OCR (text + positions) → Code (matching + parsing) — zero LLM
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectText } from "./ocr";
import { detectColumnXRanges } from "./grouping";
import { detectCVBlocks } from "./cv-detect";
import type { ParsedCourse, CVBlock, OCRWord, TimeScaleEntry } from "./types";

export type { ParsedCourse } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_KEYWORDS: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7,
};

function resolveImagePath(imageUrl: string): string | null {
  const uploadsRoot = path.resolve(process.cwd(), "public/uploads");
  const m = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
  if (m) {
    const resolved = path.resolve(uploadsRoot, m[1]);
    if (!resolved.startsWith(uploadsRoot + path.sep) && resolved !== uploadsRoot) return null;
    if (fs.existsSync(resolved)) return resolved;
  }
  if (imageUrl.startsWith("file://")) return imageUrl.replace("file://", "");
  if (imageUrl.startsWith("/") && fs.existsSync(imageUrl)) return imageUrl;
  return null;
}

function snapTo30(min: number): number { return Math.round(min / 30) * 30; }
function minutesToTime(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function parseTime(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

function ceilToHour(durationMinutes: number): number {
  return Math.max(60, Math.ceil(durationMinutes / 60) * 60);
}

function interpolateTime(y: number, ts: TimeScaleEntry[]): number {
  if (ts.length < 2) return 510; // D-07: default 08:30

  // Extrapolate above first anchor (D-04 symmetry)
  if (y <= ts[0].y) {
    if (ts.length >= 2) {
      const pxPerMin = (ts[1].y - ts[0].y) / (parseTime(ts[1].time) - parseTime(ts[0].time));
      if (pxPerMin > 0) {
        return Math.max(420, parseTime(ts[0].time) - (ts[0].y - y) / pxPerMin); // min 07:00
      }
    }
    return parseTime(ts[0].time);
  }

  // D-04: Extrapolate below last anchor
  if (y >= ts[ts.length - 1].y) {
    const last = ts[ts.length - 1];
    const prev = ts[ts.length - 2];
    const pxPerMin = (last.y - prev.y) / (parseTime(last.time) - parseTime(prev.time));
    if (pxPerMin > 0) {
      return Math.min(1320, parseTime(last.time) + (y - last.y) / pxPerMin); // max 22:00
    }
    return parseTime(last.time);
  }

  // Interpolate between anchors (unchanged)
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

// ─── Pure code: identify course name + location from text ────────────────────

// ─── Pure code: identify course names + locations from card texts ─────────────

// HKBU course code: exactly 4 uppercase letters + 4 digits (COMP3115, GCAP3105, MATH2225)
const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}$/;

function identifyCourses(
  cards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[]
): ParsedCourse[] {
  const results: ParsedCourse[] = [];

  for (const card of cards) {
    const courseNames: string[] = [];
    const locations: string[] = [];

    for (const rawText of card.texts) {
      // Strip brackets and their content
      const text = rawText.replace(/\s*\([^)]*\)\s*/g, "").trim();
      if (text.length === 0) continue;

      // Skip pure numbers, single chars, punctuation
      if (/^\d+$/.test(text) || text.length <= 1 || /^[^A-Za-z0-9]+$/.test(text)) continue;

      if (COURSE_CODE_PATTERN.test(text)) {
        if (!courseNames.includes(text)) courseNames.push(text);
      } else if (/[A-Z]/.test(text) && /\d/.test(text)) {
        // Has both letters and digits → likely a room code
        if (!locations.includes(text)) locations.push(text);
      }
    }

    if (courseNames.length === 0) continue;

    // Deduplicate course names in same card (COMP3115 may appear multiple times)
    const uniqueNames = [...new Set(courseNames)];

    for (const name of uniqueNames) {
      results.push({
        name,
        location: locations.join(", "),
        dayOfWeek: card.dayOfWeek,
        startTime: card.startTime,
        endTime: card.endTime,
      });
    }
  }

  return results;
}

// ─── Build time scale from OCR words ─────────────────────────────────────────

function buildTimeScale(
  words: OCRWord[],
  imageWidth: number,
  imageHeight: number
): { timeScale: TimeScaleEntry[]; timeColumnMaxX: number } {
  // D-01 / TIME-01: Accept HH:mm, H:mm, HH.mm, H.mm, bare integers (7-22 range)
  const timePat = /^\d{1,2}([:.]\d{2})?$/;

  // D-02: Filter out status bar area (top 8% of image)
  const statusBarY = imageHeight * 0.08;

  const allTimeWords = words.filter(w => {
    if (w.bounds.y < statusBarY) return false; // D-02
    return timePat.test(w.text.trim());
  });

  // TIME-03: Lowered threshold from 3 to 2
  if (allTimeWords.length < 2) return { timeScale: [], timeColumnMaxX: 0 };

  const sorted = [...allTimeWords].sort((a, b) => a.bounds.x - b.bounds.x);
  const leftX = sorted[0].bounds.x;
  const colWords = sorted.filter(w => Math.abs(w.bounds.x - leftX) < imageWidth * 0.05);
  const timeColumnMaxX = Math.max(...colWords.map(w => w.bounds.x + w.bounds.width));

  const timeScale: TimeScaleEntry[] = [];
  for (const w of colWords) {
    const text = w.text.trim();
    const m = text.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2] || 0);
      if (h >= 7 && h <= 22 && min >= 0 && min <= 59) {
        timeScale.push({
          y: w.bounds.y + w.bounds.height / 2,
          time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
        });
      }
    }
  }
  timeScale.sort((a, b) => a.y - b.y);

  // Dedup
  const deduped: TimeScaleEntry[] = [];
  for (const e of timeScale) if (!deduped.find(d => d.time === e.time)) deduped.push(e);

  // Interpolate missing hours (integer format only)
  if (!deduped.some(d => d.time.endsWith(":30")) && deduped.length >= 2) {
    const firstH = parseInt(deduped[0].time);
    const lastH = parseInt(deduped[deduped.length - 1].time);
    const pxPerH = (deduped[deduped.length - 1].y - deduped[0].y) / (lastH - firstH);
    for (let h = firstH; h <= lastH; h++) {
      const ts = `${String(h).padStart(2, "0")}:00`;
      if (!deduped.find(d => d.time === ts)) {
        deduped.push({ y: deduped[0].y + (h - firstH) * pxPerH, time: ts });
      }
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

  const { timeScale, timeColumnMaxX } = buildTimeScale(words, imageWidth, imageHeight);
  const hasTimeScale = timeScale.length >= 2;

  // Detect day headers
  let headers = detectHeaders(words, imageHeight);



  // Step 2: CV — detect colored course blocks (if local image)
  const imgPath = resolveImagePath(imageUrl);
  let cvBlocks: CVBlock[] = [];
  if (imgPath) {
    const cv = await detectCVBlocks(imgPath);
    cvBlocks = cv.blocks;
  } else {

  }

  // If no headers, use sharp to inject synthetic headers (for column assignment)
  if (headers.length < 2 && cvBlocks.length >= 2 && imgPath) {
    try {
      const imgBuffer = fs.readFileSync(imgPath);
      const meta = await sharp(imgBuffer).metadata();
      if (meta.width && meta.height) {
        const colRanges = await detectColumnXRanges(imgBuffer, meta.width, meta.height);
        if (colRanges.length >= 2) {
          // Analyze gaps between columns to determine relative day positions
          const avgBlockWidth = colRanges.reduce((s, r) => s + (r.xMax - r.xMin), 0) / colRanges.length;

          // Calculate the first column's dayOfWeek by counting empty columns
          // between the time scale and the first block
          const firstBlockLeft = colRanges[0].xMin;
          const emptySpace = firstBlockLeft - timeColumnMaxX;
          const emptyColumns = Math.max(0, Math.round(emptySpace / avgBlockWidth));
          // First block is day = emptyColumns + 1 (1-based: Mon=1)
          let firstDay = emptyColumns + 1;

          // Gap analysis for subsequent columns
          headers = [{ dayOfWeek: Math.min(firstDay, 7), xCenter: colRanges[0].xCenter }];

          for (let i = 1; i < colRanges.length; i++) {
            const gap = colRanges[i].xCenter - colRanges[i - 1].xCenter;
            const skippedDays = Math.max(0, Math.round(gap / avgBlockWidth) - 1);
            firstDay += 1 + skippedDays;
            headers.push({ dayOfWeek: Math.min(firstDay, 7), xCenter: colRanges[i].xCenter });
          }
        }
      }
    } catch { /* sharp failed */ }
  }

  // Step 3: Match OCR text to CV blocks → build cards
  if (cvBlocks.length > 0) {
    const cards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[] = [];

    // Time mapping: use time scale if available, otherwise proportional estimation
    const getStartEndMin = (cvb: CVBlock): { startMin: number; endMin: number } => {
      if (hasTimeScale && timeScale.length >= 2) {
        // Precise: interpolate from time scale labels
        return {
          startMin: snapTo30(interpolateTime(cvb.y, timeScale)),
          endMin: snapTo30(interpolateTime(cvb.y + cvb.height + cvb.height * 0.03, timeScale)),
        };
      } else {
        // No time scale: use block height to estimate duration
        // Then calculate startTime from vertical position

        // Step 1: Estimate px-per-hour from block heights
        // Known data from HKBU timetables:
        //   1h block height / imageHeight ≈ 0.04-0.07
        //   2h ≈ 0.09-0.14
        //   3h ≈ 0.13-0.21
        const allHeights = cvBlocks.map(b => b.height).sort((a, b) => a - b);
        const minHeight = allHeights[0];
        const minRatio = minHeight / imageHeight;

        // Determine what duration the smallest block represents
        let minBlockHours: number;
        if (minRatio < 0.08) {
          minBlockHours = 1;      // small block = 1h
        } else if (minRatio < 0.15) {
          minBlockHours = 2;      // medium block = 2h
        } else {
          minBlockHours = 3;      // large block = 3h
        }

        const estimatedPxPerHour = minHeight / minBlockHours;

        // Step 2: Calculate duration for this block
        const rawHours = cvb.height / estimatedPxPerHour;
        // Snap to nearest standard duration
        const stdHours = [1, 1.5, 2, 2.5, 3];
        let bestDuration = 1;
        let bestDiff = Infinity;
        for (const h of stdHours) {
          const diff = Math.abs(rawHours - h);
          if (diff < bestDiff) { bestDiff = diff; bestDuration = h; }
        }
        const durationMin = bestDuration * 60;

        // Step 3: Calculate startTime from vertical position
        // Use the blocks' y-positions to establish relative order
        // First block starts at ~08:00 or ~08:30
        const allBlocksMinY = Math.min(...cvBlocks.map(b => b.y));
        const startOffsetY = cvb.y - allBlocksMinY;
        const startOffsetHours = startOffsetY / estimatedPxPerHour;
        const startMin = snapTo30(480 + startOffsetHours * 60); // 480 = 08:00
        const endMin = startMin + durationMin;

        return { startMin, endMin };
      }
    };

    for (const cvb of cvBlocks) {
      const dayOfWeek = assignDayOfWeek(cvb, headers, timeColumnMaxX, imageWidth);
      const { startMin, endMin } = getStartEndMin(cvb);
      if (endMin <= startMin) continue;

      const startTime = minutesToTime(startMin);
      const endTime = minutesToTime(endMin);

      // Find OCR words inside this CV block
      const textsInBlock: string[] = [];
      for (const w of words) {
        const wCenterX = w.bounds.x + w.bounds.width / 2;
        const wCenterY = w.bounds.y + w.bounds.height / 2;
        const pad = 10;
        if (wCenterX >= cvb.x - pad && wCenterX <= cvb.x + cvb.width + pad &&
            wCenterY >= cvb.y - pad && wCenterY <= cvb.y + cvb.height + pad) {
          const t = w.text.trim();
          if (t.length > 1 || /[A-Z0-9]/.test(t)) textsInBlock.push(t);
        }
      }

      if (textsInBlock.length > 0) {
        cards.push({ dayOfWeek, startTime, endTime, texts: textsInBlock });
      }
    }

    if (cards.length > 0) {
      const courses = identifyCourses(cards);
      return mergeSameName(dedup(courses));
    }
  }

  // Fallback: no CV blocks → use OCR grouping + pure code parsing
  const { groupDocBlocksIntoColumns, groupWordsIntoColumns } = await import("./grouping");
  const { columns } = ocrResult.blocks.length > 0
    ? groupDocBlocksIntoColumns(ocrResult.blocks, words, imageWidth, imageHeight)
    : groupWordsIntoColumns(words, imageWidth, imageHeight);
  if (columns.length === 0) return [];

  // Convert column text groups into cards with time from OCR
  const fallbackCards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[] = [];
  for (const col of columns) {
    for (let i = 0; i < col.textGroups.length; i++) {
      const g = col.textGroups[i];
      const startMin = hasTimeScale ? snapTo30(interpolateTime(g.yMin, timeScale)) : 480 + i * 60;
      const nextYMin = i + 1 < col.textGroups.length ? col.textGroups[i + 1].yMin : undefined;
      const endMin = nextYMin !== undefined && hasTimeScale
        ? snapTo30(interpolateTime(nextYMin, timeScale))
        : startMin + 60;
      fallbackCards.push({
        dayOfWeek: col.dayOfWeek,
        startTime: minutesToTime(startMin),
        endTime: minutesToTime(Math.max(endMin, startMin + 30)),
        texts: g.texts,
      });
    }
  }

  const courses = identifyCourses(fallbackCards);
  return mergeSameName(dedup(courses));
}

// Test exports
export { buildTimeScale, interpolateTime, ceilToHour, minutesToTime, parseTime, snapTo30 };
