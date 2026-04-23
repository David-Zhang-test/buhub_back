// buhub_back/src/lib/schedule/index.ts
// Pipeline: CV (block detection) + OCR (text + positions) → Code (matching + parsing) — zero LLM
import fs from "fs";
import path from "path";
import { detectText } from "./ocr";
import { detectCVBlocks } from "./cv-detect";
import { detectHeaders, buildColumnIntervals, assignDayByInterval, determineDayDetectionTier } from "./day-detect";
import { dedup, mergeSameName, resolveOverlaps } from "./dedup";
import { identifyCourses } from "./course-match";
import type { CVBlock, OCRWord, TimeScaleEntry, GridColumn, ParseScheduleResult, ParseScheduleMeta } from "./types";

export type { ParsedCourse, ParseScheduleResult, ParseScheduleMeta, DayDetectionTier } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function roundToHour(durationMinutes: number): number {
  return Math.max(60, Math.round(durationMinutes / 60) * 60);
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

// ─── Pure code: identify course name + location from text ────────────────────

// ─── Pure code: identify course names + locations from card texts ─────────────

// identifyCourses imported from course-match.ts (Phase 14 — widened regex, spatial classification, room disambiguation)

// ─── Build time scale from OCR words ─────────────────────────────────────────

function buildTimeScale(
  words: OCRWord[],
  imageWidth: number,
  imageHeight: number
): { timeScale: TimeScaleEntry[]; timeColumnMaxX: number } {
  // D-01 / TIME-01: Accept HH:mm, H:mm, HH.mm, H.mm, bare integers (7-22 range),
  // with optional am/pm suffix (e.g. "8am", "2:30PM").
  const timePat = /^\d{1,2}([:.]\d{2})?(am|pm)?$/i;

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
    const m = text.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/i);
    if (m) {
      let h = Number(m[1]);
      const min = Number(m[2] || 0);
      const ampm = m[3]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
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

// ─── No-timescale estimation (TIME-02) ──────────────────────────────────────

function estimateNoTimescale(
  cvb: CVBlock,
  allBlocks: CVBlock[]
): { startMin: number; endMin: number } {
  // D-08: Smallest detected color block = 1 hour baseline
  const allHeights = allBlocks.map(b => b.height).filter(h => h > 0).sort((a, b) => a - b);
  const minHeight = allHeights[0] || 1; // guard against empty/zero

  // Guard against zero-height blocks
  if (minHeight <= 0) return { startMin: 510, endMin: 570 }; // default 08:30-09:30

  const estimatedPxPerHour = minHeight; // 1 block height = 1 hour (D-08)

  // D-06: Duration = ceiling of raw hours, minimum 1h
  const rawHours = cvb.height / estimatedPxPerHour;
  const durationHours = Math.max(1, Math.ceil(rawHours)); // D-06: ceiling
  const durationMin = durationHours * 60;

  // D-07: Default start 08:30 (510 minutes)
  const DEFAULT_START = 510;
  const allBlocksMinY = Math.min(...allBlocks.map(b => b.y));
  const startOffsetY = cvb.y - allBlocksMinY;
  const startOffsetHours = startOffsetY / estimatedPxPerHour;
  const startMin = snapTo30(DEFAULT_START + startOffsetHours * 60); // D-05: snap start to 30min
  const endMin = startMin + durationMin;

  return { startMin, endMin };
}

// ─── Main: CV-first pipeline ─────────────────────────────────────────────────

export async function parseScheduleImage(imageUrl: string): Promise<ParseScheduleResult> {
  // Step 1: OCR — get all text + positions + time scale
  const ocrResult = await detectText(imageUrl);
  const { words, imageWidth, imageHeight } = ocrResult;
  if (words.length === 0) {
    return { courses: [], meta: { dayDetectionTier: 3, dayHeadersFound: 0, columnCount: 0 } };
  }

  const { timeScale, timeColumnMaxX } = buildTimeScale(words, imageWidth, imageHeight);
  const hasTimeScale = timeScale.length >= 2;

  // Detect day headers
  const headers = detectHeaders(words, imageHeight);

  // Step 2: CV — detect colored course blocks
  const imgPath = resolveImagePath(imageUrl);
  let cvBlocks: CVBlock[] = [];
  let gridColumns: GridColumn[] = [];

  if (imgPath) {
    const cv = await detectCVBlocks(imgPath);
    cvBlocks = cv.blocks;
    gridColumns = cv.gridColumns;
  } else {
    // If not local, try fetching from S3 if enabled
    try {
      const { isS3UploadsEnabled, fetchUploadObjectFromS3 } = await import("../s3");
      if (isS3UploadsEnabled()) {
        const match = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
        if (match) {
          const fileKey = decodeURIComponent(match[1]);
          const s3Data = await fetchUploadObjectFromS3(fileKey, null);
          if (s3Data && s3Data.status === 200) {
            const cv = await detectCVBlocks(Buffer.from(s3Data.body));
            cvBlocks = cv.blocks;
            gridColumns = cv.gridColumns;
          }
        }
      }
    } catch (e) {
      console.warn("[CV] S3 fetch failed, falling back to OCR-only:", e);
    }
  }

  // Build column intervals using 3-tier priority: gridColumns > headers > x-clustering
  const columnIntervals = buildColumnIntervals({
    gridColumns,
    headers,
    cvBlocks,
    timeColumnMaxX,
    imageWidth,
  });

  const meta: ParseScheduleMeta = {
    dayDetectionTier: determineDayDetectionTier({ gridColumns, headers, timeColumnMaxX }),
    dayHeadersFound: headers.length,
    columnCount: columnIntervals.length,
  };

  // Step 3: Match OCR text to CV blocks → build cards
  if (cvBlocks.length > 0) {
    const cards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[] = [];

    // Time mapping: use time scale if available, otherwise proportional estimation
    const getStartEndMin = (cvb: CVBlock): { startMin: number; endMin: number } => {
      if (hasTimeScale && timeScale.length >= 2) {
        // D-05: Snap start to 30-min, keep raw end for duration calc
        const rawStartMin = snapTo30(interpolateTime(cvb.y, timeScale));
        const rawEndMin = interpolateTime(cvb.y + cvb.height + cvb.height * 0.03, timeScale);
        // ROBUST-02 + D-06: Ceil duration to integer hour
        const duration = roundToHour(rawEndMin - rawStartMin);
        const endMin = rawStartMin + duration;
        return { startMin: rawStartMin, endMin };
      } else {
        // No time scale: use block height ratio estimation
        return estimateNoTimescale(cvb, cvBlocks);
      }
    };

    for (const cvb of cvBlocks) {
      const blockCenterX = cvb.x + cvb.width / 2;
      const dayOfWeek = columnIntervals.length > 0
        ? assignDayByInterval(blockCenterX, columnIntervals)
        : 1; // fallback: Monday
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
      return { courses: resolveOverlaps(mergeSameName(dedup(courses))), meta };
    }
  }

  // Fallback: no CV blocks → use OCR grouping + pure code parsing
  const { groupDocBlocksIntoColumns, groupWordsIntoColumns } = await import("./grouping");
  const { columns } = ocrResult.blocks.length > 0
    ? groupDocBlocksIntoColumns(ocrResult.blocks, words, imageWidth, imageHeight)
    : groupWordsIntoColumns(words, imageWidth, imageHeight);
  if (columns.length === 0) return { courses: [], meta };

  // CV-03: Cross-column duration inference for last-block estimation
  const reliableDurations: number[] = [];
  if (hasTimeScale) {
    for (const col of columns) {
      for (let i = 0; i < col.textGroups.length - 1; i++) {
        const g = col.textGroups[i];
        const nextG = col.textGroups[i + 1];
        const start = snapTo30(interpolateTime(g.yMin, timeScale));
        const end = snapTo30(interpolateTime(nextG.yMin, timeScale));
        const dur = roundToHour(end - start);
        if (dur > 0 && dur <= 240) reliableDurations.push(dur);
      }
    }
  }
  const medianDuration = reliableDurations.length > 0
    ? reliableDurations.sort((a, b) => a - b)[Math.floor(reliableDurations.length / 2)]
    : 60;

  // Convert column text groups into cards with time from OCR
  const fallbackCards: { dayOfWeek: number; startTime: string; endTime: string; texts: string[] }[] = [];
  for (const col of columns) {
    for (let i = 0; i < col.textGroups.length; i++) {
      const g = col.textGroups[i];
      const startMin = hasTimeScale
        ? snapTo30(interpolateTime(g.yMin, timeScale))
        : 510 + i * 60; // D-07: default 08:30
      const nextYMin = i + 1 < col.textGroups.length ? col.textGroups[i + 1].yMin : undefined;
      let endMin: number;
      if (nextYMin !== undefined && hasTimeScale) {
        const rawEnd = interpolateTime(nextYMin, timeScale);
        const duration = roundToHour(rawEnd - startMin); // ROBUST-02
        endMin = startMin + duration;
      } else {
        endMin = startMin + medianDuration; // CV-03: use median from non-last blocks
      }
      fallbackCards.push({
        dayOfWeek: col.dayOfWeek,
        startTime: minutesToTime(startMin),
        endTime: minutesToTime(Math.max(endMin, startMin + 30)),
        texts: g.texts,
      });
    }
  }

  const courses = identifyCourses(fallbackCards);
  return { courses: resolveOverlaps(mergeSameName(dedup(courses))), meta };
}

// Test exports
export { buildTimeScale, interpolateTime, roundToHour, minutesToTime, parseTime, snapTo30, estimateNoTimescale };
