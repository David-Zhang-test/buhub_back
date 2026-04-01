// buhub_back/src/lib/schedule/grouping.ts
import type { OCRWord, CourseBlock, ColumnData, TextGroup, TimeScaleEntry, DocBlock, CVBlock, ColumnInterval, GridColumn } from "./types";
import { detectHeaders as sharedDetectHeaders, DAY_KEYWORDS, buildColumnIntervals, assignDayByInterval } from "./day-detect";
import sharp from "sharp";

/**
 * Detect colored block y-ranges in a column strip of the image.
 * Returns array of {topY, bottomY} for each contiguous colored region.
 */
export async function detectBlockYRanges(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  xMin: number,
  xMax: number,
): Promise<{ topY: number; bottomY: number }[]> {
  try {
    const left = Math.max(0, Math.floor(xMin));
    const right = Math.min(imageWidth, Math.ceil(xMax));
    const colW = right - left;
    if (colW <= 0) return [];

    const { data, info } = await sharp(imageBuffer)
      .extract({ left, top: 0, width: colW, height: imageHeight })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width, h = info.height, ch = info.channels;

    // For each row, check if any pixel is "colored" (saturated)
    const rowHasColor = new Array(h).fill(false);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * ch;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max > 0 ? (max - min) / max : 0;
        if (sat > 0.15 && max > 80 && max < 255) {
          rowHasColor[y] = true;
          break;
        }
      }
    }

    // Find contiguous colored row ranges
    const ranges: { topY: number; bottomY: number }[] = [];
    let inBlock = false;
    let blockStart = 0;
    const minBlockHeight = 20; // minimum pixels for a valid block

    for (let y = 0; y < h; y++) {
      if (rowHasColor[y] && !inBlock) { blockStart = y; inBlock = true; }
      else if (!rowHasColor[y] && inBlock) {
        if (y - blockStart >= minBlockHeight) {
          ranges.push({ topY: blockStart, bottomY: y });
        }
        inBlock = false;
      }
    }
    if (inBlock && h - blockStart >= minBlockHeight) {
      ranges.push({ topY: blockStart, bottomY: h });
    }

    return ranges;
  } catch {
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect colored column x-ranges across the image using sharp.
 * Returns sorted column ranges: [{xMin, xMax, xCenter}]
 */
export async function detectColumnXRanges(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
): Promise<{ xMin: number; xMax: number; xCenter: number }[]> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width, h = info.height, ch = info.channels;
    const yStart = Math.floor(h * 0.12);
    const yEnd = Math.floor(h * 0.97);
    const scanH = yEnd - yStart;

    // Count colored pixels per x-column
    const colColorCounts = new Array(w).fill(0);
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * ch;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max > 0 ? (max - min) / max : 0;
        if (sat > 0.2 && max > 100 && max < 255) colColorCounts[x]++;
      }
    }

    // Smooth and find colored regions
    const smoothed = new Array(w).fill(0);
    const kernel = 5;
    for (let x = kernel; x < w - kernel; x++) {
      let sum = 0;
      for (let k = -kernel; k <= kernel; k++) sum += colColorCounts[x + k];
      smoothed[x] = sum / (2 * kernel + 1);
    }

    const minRatio = 0.05;
    const regions: { xMin: number; xMax: number }[] = [];
    let inBlock = false;
    let blockStart = 0;

    for (let x = 1; x < w; x++) {
      const isColored = smoothed[x] / scanH > minRatio;
      if (isColored && !inBlock) { blockStart = x; inBlock = true; }
      else if (!isColored && inBlock) {
        if (x - blockStart > 20) regions.push({ xMin: blockStart, xMax: x });
        inBlock = false;
      }
    }
    if (inBlock && w - blockStart > 20) regions.push({ xMin: blockStart, xMax: w - 1 });

    return regions.map(r => ({
      xMin: r.xMin,
      xMax: r.xMax,
      xCenter: (r.xMin + r.xMax) / 2,
    }));
  } catch {
    return [];
  }
}

/** Snap minutes to nearest :00 or :30 */
function snapTo30(minutes: number): number {
  return Math.round(minutes / 30) * 30;
}

/**
 * Compute adaptive gap threshold from actual gap distribution.
 * Uses P75 * 1.5 as the inter-block break point, but never less than
 * medianHeight * 1.5 to avoid over-splitting.
 */
export function computeAdaptiveGapThreshold(
  sortedWords: { bounds: { y: number; height: number } }[],
  fallbackMedianHeight: number,
): number {
  if (sortedWords.length < 2) return fallbackMedianHeight * 2.5;

  const gaps: number[] = [];
  for (let i = 1; i < sortedWords.length; i++) {
    const prevBottom = sortedWords[i - 1].bounds.y + sortedWords[i - 1].bounds.height;
    const gap = sortedWords[i].bounds.y - prevBottom;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return fallbackMedianHeight * 2.5;

  const sorted = [...gaps].sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  return Math.max(p75 * 1.5, fallbackMedianHeight * 1.5);
}

/** Format minutes since midnight as "HH:mm" */
function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parse time string like "08", "09:30", "10" into minutes since midnight */
function parseTimeLabel(text: string): number | null {
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2] || 0);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Noise words to filter out */
const NOISE_PATTERNS = [
  /^class$/i, /^timetable$/i, /^student$/i, /^no\.?$/i,
  /^data$/i, /^as$/i, /^of$/i, /^notes?$/i, /^semester$/i,
  /^hkt$/i, /^mar$/i, /^jan$/i, /^feb$/i, /^apr$/i,
  /^you$/i, /^may$/i, /^login$/i, /^buniport$/i, /^view$/i,
  /^the$/i, /^to$/i, /^if$/i, /^or$/i, /^current$/i, /^term$/i,
  /^wish$/i,
];

export function groupWordsIntoCourseBlocks(
  words: OCRWord[],
  imageWidth: number,
  imageHeight: number
): CourseBlock[] {
  if (words.length === 0) return [];

  // ─── Step 1: Find time scale column ──────────────────────────────────────
  const topCutoffForTime = imageHeight * 0.12; // skip status bar area for time detection
  const timePattern = /^\d{1,2}(:\d{2})?$/;
  const timeWords = words.filter(w =>
    timePattern.test(w.text.trim()) && w.bounds.y > topCutoffForTime
  );

  // Time column = leftmost cluster of time-pattern words
  let timeColumnMaxX = 0;
  const timeYMap: { y: number; minutes: number }[] = [];

  if (timeWords.length >= 3) {
    // Sort by x, take the leftmost group
    const sortedByX = [...timeWords].sort((a, b) => a.bounds.x - b.bounds.x);
    const leftmostX = sortedByX[0].bounds.x;
    const timeColumnWords = sortedByX.filter(w => Math.abs(w.bounds.x - leftmostX) < imageWidth * 0.08);
    timeColumnMaxX = Math.max(...timeColumnWords.map(w => w.bounds.x + w.bounds.width));

    for (const w of timeColumnWords) {
      const min = parseTimeLabel(w.text.trim());
      if (min !== null) {
        timeYMap.push({ y: w.bounds.y + w.bounds.height / 2, minutes: min });
      }
    }
    timeYMap.sort((a, b) => a.y - b.y);
  }

  // ─── Step 2: Filter noise ────────────────────────────────────────────────
  const topCutoff = imageHeight * 0.12;
  const bottomCutoff = imageHeight * 0.97;

  const courseWords = words.filter(w => {
    if (w.bounds.y < topCutoff || w.bounds.y > bottomCutoff) return false;
    if (w.bounds.x + w.bounds.width / 2 < timeColumnMaxX) return false; // in time column
    if (NOISE_PATTERNS.some(p => p.test(w.text.trim()))) return false;
    if (w.text.trim().length === 0) return false;
    return true;
  });

  if (courseWords.length === 0) return [];

  // ─── Step 3: Detect day headers ──────────────────────────────────────────
  const rawHeaders = sharedDetectHeaders(words, imageHeight);
  const headers = rawHeaders.map(h => ({ text: "", dayOfWeek: h.dayOfWeek, xCenter: h.xCenter }));

  // ─── Step 4+5: Assign words to columns with dayOfWeek ─────────────────────

  const columns: { xMin: number; xMax: number; xCenter: number; dayOfWeek: number; words: OCRWord[] }[] = [];

  if (headers.length >= 2) {
    // HEADER-BASED columns: use header midpoints as column boundaries (most precise)
    // Sort headers by x-position
    const sortedHeaders = [...headers].sort((a, b) => a.xCenter - b.xCenter);

    for (let i = 0; i < sortedHeaders.length; i++) {
      const leftBound = i === 0
        ? timeColumnMaxX  // left edge = end of time column
        : (sortedHeaders[i - 1].xCenter + sortedHeaders[i].xCenter) / 2;
      const rightBound = i === sortedHeaders.length - 1
        ? imageWidth  // right edge = image boundary
        : (sortedHeaders[i].xCenter + sortedHeaders[i + 1].xCenter) / 2;

      columns.push({
        xMin: leftBound,
        xMax: rightBound,
        xCenter: sortedHeaders[i].xCenter,
        dayOfWeek: sortedHeaders[i].dayOfWeek,
        words: [],
      });
    }

    // Assign words to their column by x-position range
    for (const w of courseWords) {
      const wCenter = w.bounds.x + w.bounds.width / 2;
      for (const col of columns) {
        if (wCenter >= col.xMin && wCenter < col.xMax) {
          col.words.push(w);
          break;
        }
      }
    }
  } else {
    // NO HEADERS: build intervals via clustering (same logic as day-detect.ts Priority 3)
    // Create pseudo-CVBlocks from courseWords for clustering
    const pseudoBlocks: CVBlock[] = courseWords.map(w => ({
      x: w.bounds.x, y: w.bounds.y, width: w.bounds.width, height: w.bounds.height,
    }));
    const intervals = buildColumnIntervals({
      gridColumns: [],
      headers: [],
      cvBlocks: pseudoBlocks,
      timeColumnMaxX,
      imageWidth,
    });
    for (const iv of intervals) {
      columns.push({
        xMin: iv.xMin,
        xMax: iv.xMax,
        xCenter: iv.xCenter,
        dayOfWeek: iv.dayOfWeek,
        words: [],
      });
    }
    // Assign words using interval-based assignment
    for (const w of courseWords) {
      const wCenter = w.bounds.x + w.bounds.width / 2;
      const day = assignDayByInterval(wCenter, intervals);
      const col = columns.find(c => c.dayOfWeek === day);
      if (col) col.words.push(w);
    }
  }

  // ─── Step 6: Group words into blocks within each column ──────────────────
  const allHeights = courseWords.map(w => w.bounds.height).sort((a, b) => a - b);
  const medianHeight = allHeights[Math.floor(allHeights.length / 2)] || 20;

  const blocks: CourseBlock[] = [];

  for (const col of columns) {
    const colWords = [...col.words].sort((a, b) => a.bounds.y - b.bounds.y);
    if (colWords.length === 0) continue;

    const blockGapThreshold = computeAdaptiveGapThreshold(colWords, medianHeight);

    // First pass: split into block word groups
    const blockGroups: OCRWord[][] = [];
    let currentBlock: OCRWord[] = [colWords[0]];

    for (let i = 1; i < colWords.length; i++) {
      const prevBottom = currentBlock[currentBlock.length - 1].bounds.y + currentBlock[currentBlock.length - 1].bounds.height;
      const currentTop = colWords[i].bounds.y;

      if (currentTop - prevBottom > blockGapThreshold) {
        blockGroups.push(currentBlock);
        currentBlock = [];
      }
      currentBlock.push(colWords[i]);
    }
    if (currentBlock.length > 0) blockGroups.push(currentBlock);

    // Second pass: build blocks
    for (let b = 0; b < blockGroups.length; b++) {
      const nextTopY = b + 1 < blockGroups.length
        ? Math.min(...blockGroups[b + 1].map(w => w.bounds.y))
        : undefined;
      blocks.push(buildBlock(blockGroups[b], col.dayOfWeek, timeYMap, imageHeight, nextTopY));
    }
  }

  // ─── Post-processing: fix last-block endTimes using cross-column info ──────
  // For each column's last block (endTime = startTime + 1h default),
  // look at blocks in OTHER columns that start at similar y-positions.
  // If another column has a block ending at a specific time near our block's position,
  // use that as a reference.
  if (timeYMap.length >= 2) {
    // Collect reliable durations from non-last blocks (where endTime came from nextBlock)
    const reliableDurations: number[] = [];
    const byDay = new Map<number, typeof blocks>();
    for (const b of blocks) {
      if (!byDay.has(b.dayOfWeek)) byDay.set(b.dayOfWeek, []);
      byDay.get(b.dayOfWeek)!.push(b);
    }
    for (const [, dayBlocks] of byDay) {
      for (let i = 0; i < dayBlocks.length - 1; i++) {
        const dur = timeToMinutes(dayBlocks[i].endTime) - timeToMinutes(dayBlocks[i].startTime);
        if (dur > 0 && dur <= 240) reliableDurations.push(dur);
      }
    }

    // For last blocks with default 1h endTime, try to improve
    for (const [, dayBlocks] of byDay) {
      const lastBlock = dayBlocks[dayBlocks.length - 1];
      const lastStart = timeToMinutes(lastBlock.startTime);
      const lastEnd = timeToMinutes(lastBlock.endTime);
      const lastDur = lastEnd - lastStart;

      if (lastDur <= 60 && reliableDurations.length > 0) {
        // Use median of reliable durations from other blocks
        const sorted = [...reliableDurations].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        lastBlock.endTime = minutesToTime(snapTo30(lastStart + median));
      }
    }
  }

  return blocks;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function buildBlock(
  words: OCRWord[],
  dayOfWeek: number,
  timeYMap: { y: number; minutes: number }[],
  imageHeight: number,
  nextBlockTopY?: number
): CourseBlock {
  const topY = Math.min(...words.map(w => w.bounds.y));
  const texts = words.map(w => w.text.trim()).filter(t => t.length > 0);

  let startTime: string;
  let endTime: string;

  if (timeYMap.length >= 2) {
    // startTime: find the nearest time scale label AT or ABOVE the text top
    const startMin = snapTo30(interpolateTime(topY, timeYMap));
    startTime = minutesToTime(startMin);

    // endTime: use the next block's start position, or estimate from time scale spacing
    if (nextBlockTopY !== undefined) {
      // Next block exists in same column → endTime = next block's startTime
      const endMin = snapTo30(interpolateTime(nextBlockTopY, timeYMap));
      endTime = minutesToTime(endMin);
    } else {
      // Last block in column — no next block reference
      // Strategy: use the time scale interval as minimum duration (usually 1h)
      // Then check if other blocks in the image with known durations suggest a pattern
      const intervalMin = timeYMap.length >= 2
        ? Math.abs(timeYMap[1].minutes - timeYMap[0].minutes) : 60;
      endTime = minutesToTime(startMin + intervalMin);
    }
  } else {
    // Proportional fallback (08:00 to 22:00)
    const startMin = snapTo30(480 + (topY / imageHeight) * (22 - 8) * 60);
    const endEstY = nextBlockTopY ?? (topY + imageHeight * 0.1);
    const endMin = snapTo30(480 + (endEstY / imageHeight) * (22 - 8) * 60);
    startTime = minutesToTime(startMin);
    endTime = minutesToTime(Math.max(endMin, startMin + 60));
  }

  // Ensure minimum 30 min duration
  const startMinutes = parseInt(startTime.split(":")[0]) * 60 + parseInt(startTime.split(":")[1]);
  const endMinutes = parseInt(endTime.split(":")[0]) * 60 + parseInt(endTime.split(":")[1]);
  if (endMinutes <= startMinutes) {
    endTime = minutesToTime(startMinutes + 60);
  }

  return { dayOfWeek, startTime, endTime, texts };
}

function interpolateTime(y: number, timeYMap: { y: number; minutes: number }[]): number {
  if (y <= timeYMap[0].y) return timeYMap[0].minutes;
  if (y >= timeYMap[timeYMap.length - 1].y) return timeYMap[timeYMap.length - 1].minutes;

  for (let i = 0; i < timeYMap.length - 1; i++) {
    if (y >= timeYMap[i].y && y <= timeYMap[i + 1].y) {
      const ratio = (y - timeYMap[i].y) / (timeYMap[i + 1].y - timeYMap[i].y);
      return timeYMap[i].minutes + ratio * (timeYMap[i + 1].minutes - timeYMap[i].minutes);
    }
  }
  return timeYMap[0].minutes;
}

// ─── New: Column-based grouping for LLM time inference ───────────────────────

/**
 * Group OCR words into columns with text groups + time scale data.
 * Returns structured data for LLM to infer startTime/endTime.
 */
export function groupWordsIntoColumns(
  words: OCRWord[],
  imageWidth: number,
  imageHeight: number
): { columns: ColumnData[]; timeScale: TimeScaleEntry[] } {
  if (words.length === 0) return { columns: [], timeScale: [] };

  // ─── Find time scale column ────────────────────────────────────────────────
  const topCutoffForTime = imageHeight * 0.12;
  const timePattern = /^\d{1,2}(:\d{2})?$/;
  const timeWords = words.filter(w =>
    timePattern.test(w.text.trim()) && w.bounds.y > topCutoffForTime
  );

  let timeColumnMaxX = 0;
  const timeScale: TimeScaleEntry[] = [];

  if (timeWords.length >= 3) {
    const sortedByX = [...timeWords].sort((a, b) => a.bounds.x - b.bounds.x);
    const leftmostX = sortedByX[0].bounds.x;
    const timeColumnWords = sortedByX.filter(w => Math.abs(w.bounds.x - leftmostX) < imageWidth * 0.08);
    timeColumnMaxX = Math.max(...timeColumnWords.map(w => w.bounds.x + w.bounds.width));

    for (const w of timeColumnWords) {
      const match = w.text.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
      if (match) {
        const h = Number(match[1]);
        const m = Number(match[2] || 0);
        if (h >= 0 && h <= 23) {
          timeScale.push({
            y: w.bounds.y + w.bounds.height / 2,
            time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          });
        }
      }
    }
    timeScale.sort((a, b) => a.y - b.y);

    // Deduplicate: keep only one entry per time value (nearest to expected position)
    const deduped: TimeScaleEntry[] = [];
    for (const entry of timeScale) {
      const existing = deduped.find(d => d.time === entry.time);
      if (!existing) {
        deduped.push(entry);
      }
      // keep the first occurrence (already sorted by y)
    }

    // Fill missing hours by interpolation — ONLY for integer-hour format
    // Half-hour format (labels like 08:30, 09:30) already has every hour covered
    const isHalfHourFormat = deduped.some(d => d.time.endsWith(":30"));

    if (!isHalfHourFormat && deduped.length >= 2) {
      const firstH = parseInt(deduped[0].time.split(":")[0]);
      const lastH = parseInt(deduped[deduped.length - 1].time.split(":")[0]);
      const avgPixPerHour = (deduped[deduped.length - 1].y - deduped[0].y) / (lastH - firstH);

      for (let h = firstH; h <= lastH; h++) {
        const timeStr = `${String(h).padStart(2, "0")}:00`;
        if (!deduped.find(d => d.time === timeStr)) {
          const expectedY = deduped[0].y + (h - firstH) * avgPixPerHour;
          deduped.push({ y: expectedY, time: timeStr });
        }
      }
      deduped.sort((a, b) => a.y - b.y);
    }

    // Replace timeScale with cleaned version
    timeScale.length = 0;
    timeScale.push(...deduped);
  }

  // ─── Filter noise ──────────────────────────────────────────────────────────
  const topCutoff = imageHeight * 0.12;
  const bottomCutoff = imageHeight * 0.97;

  const courseWords = words.filter(w => {
    if (w.bounds.y < topCutoff || w.bounds.y > bottomCutoff) return false;
    if (w.bounds.x + w.bounds.width / 2 < timeColumnMaxX) return false;
    if (NOISE_PATTERNS.some(p => p.test(w.text.trim()))) return false;
    if (w.text.trim().length === 0) return false;
    return true;
  });

  if (courseWords.length === 0) return { columns: [], timeScale };

  // ─── Detect day headers ────────────────────────────────────────────────────
  const headers = sharedDetectHeaders(words, imageHeight);

  // ─── Assign words to columns ───────────────────────────────────────────────
  const cols: { dayOfWeek: number; words: OCRWord[] }[] = [];

  if (headers.length >= 2) {
    // Header-based columns
    const sortedHeaders = [...headers].sort((a, b) => a.xCenter - b.xCenter);
    for (let i = 0; i < sortedHeaders.length; i++) {
      const leftBound = i === 0 ? timeColumnMaxX : (sortedHeaders[i - 1].xCenter + sortedHeaders[i].xCenter) / 2;
      const rightBound = i === sortedHeaders.length - 1 ? imageWidth : (sortedHeaders[i].xCenter + sortedHeaders[i + 1].xCenter) / 2;
      cols.push({ dayOfWeek: sortedHeaders[i].dayOfWeek, words: [] });
      for (const w of courseWords) {
        const wCenter = w.bounds.x + w.bounds.width / 2;
        if (wCenter >= leftBound && wCenter < rightBound) {
          cols[cols.length - 1].words.push(w);
        }
      }
    }
  } else {
    // No headers: use buildColumnIntervals clustering for multi-column detection
    const pseudoBlocks: CVBlock[] = courseWords.map(w => ({
      x: w.bounds.x, y: w.bounds.y, width: w.bounds.width, height: w.bounds.height,
    }));
    const intervals = buildColumnIntervals({
      gridColumns: [],
      headers: [],
      cvBlocks: pseudoBlocks,
      timeColumnMaxX,
      imageWidth,
    });
    if (intervals.length > 0) {
      for (const iv of intervals) {
        cols.push({ dayOfWeek: iv.dayOfWeek, words: [] });
      }
      for (const w of courseWords) {
        const wCenter = w.bounds.x + w.bounds.width / 2;
        const day = assignDayByInterval(wCenter, intervals);
        const col = cols.find(c => c.dayOfWeek === day);
        if (col) col.words.push(w);
      }
    } else {
      cols.push({ dayOfWeek: 1, words: [...courseWords] });
    }
  }

  // ─── Group words into text groups within each column ───────────────────────
  const allHeights = courseWords.map(w => w.bounds.height).sort((a, b) => a - b);
  const medianHeight = allHeights[Math.floor(allHeights.length / 2)] || 20;

  const columns: ColumnData[] = [];
  for (const col of cols) {
    const sorted = [...col.words].sort((a, b) => a.bounds.y - b.bounds.y);
    if (sorted.length === 0) continue;

    const blockGapThreshold = computeAdaptiveGapThreshold(sorted, medianHeight);

    const groups: TextGroup[] = [];
    let currentGroup: OCRWord[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prevBottom = currentGroup[currentGroup.length - 1].bounds.y + currentGroup[currentGroup.length - 1].bounds.height;
      const currentTop = sorted[i].bounds.y;
      if (currentTop - prevBottom > blockGapThreshold) {
        groups.push({
          yMin: Math.min(...currentGroup.map(w => w.bounds.y)),
          yMax: Math.max(...currentGroup.map(w => w.bounds.y + w.bounds.height)),
          texts: currentGroup.map(w => w.text.trim()).filter(t => t.length > 0),
        });
        currentGroup = [];
      }
      currentGroup.push(sorted[i]);
    }
    if (currentGroup.length > 0) {
      groups.push({
        yMin: Math.min(...currentGroup.map(w => w.bounds.y)),
        yMax: Math.max(...currentGroup.map(w => w.bounds.y + w.bounds.height)),
        texts: currentGroup.map(w => w.text.trim()).filter(t => t.length > 0),
      });
    }

    if (groups.length > 0) {
      columns.push({ dayOfWeek: col.dayOfWeek, textGroups: groups });
    }
  }

  return { columns, timeScale };
}

// ─── DocBlock-based grouping (uses DOCUMENT_TEXT_DETECTION blocks) ────────────

/**
 * Group using DocBlocks from DOCUMENT_TEXT_DETECTION.
 * Each DocBlock has a precise bounding box. We use these for more accurate y-ranges
 * and cluster them into columns + text groups.
 */
export function groupDocBlocksIntoColumns(
  blocks: DocBlock[],
  words: OCRWord[],
  imageWidth: number,
  imageHeight: number
): { columns: ColumnData[]; timeScale: TimeScaleEntry[] } {
  if (blocks.length === 0) return groupWordsIntoColumns(words, imageWidth, imageHeight);

  // ─── Find time scale from words ─────────────────────────────────────────────
  // Don't filter by y-cutoff: time labels start at top of timetable
  // Instead rely on x-position to identify the time column (leftmost digits)
  const timePattern = /^\d{1,2}(:\d{2})?$/;
  const allTimeWords = words.filter(w => timePattern.test(w.text.trim()));

  let timeColumnMaxX = 0;
  const timeScale: TimeScaleEntry[] = [];

  if (allTimeWords.length >= 3) {
    const sortedByX = [...allTimeWords].sort((a, b) => a.bounds.x - b.bounds.x);
    const leftmostX = sortedByX[0].bounds.x;
    // Tight x-filter (5% of image width) to avoid picking up status bar times
    const timeColumnWords = sortedByX.filter(w => Math.abs(w.bounds.x - leftmostX) < imageWidth * 0.05);
    timeColumnMaxX = Math.max(...timeColumnWords.map(w => w.bounds.x + w.bounds.width));

    for (const w of timeColumnWords) {
      const match = w.text.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
      if (match) {
        const h = Number(match[1]);
        const m = Number(match[2] || 0);
        if (h >= 0 && h <= 23) {
          timeScale.push({
            y: w.bounds.y + w.bounds.height / 2,
            time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          });
        }
      }
    }
    timeScale.sort((a, b) => a.y - b.y);

    // Dedup
    const deduped: TimeScaleEntry[] = [];
    for (const entry of timeScale) {
      if (!deduped.find(d => d.time === entry.time)) deduped.push(entry);
    }
    const isHalfHourFormat = deduped.some(d => d.time.endsWith(":30"));
    if (!isHalfHourFormat && deduped.length >= 2) {
      const firstH = parseInt(deduped[0].time.split(":")[0]);
      const lastH = parseInt(deduped[deduped.length - 1].time.split(":")[0]);
      const avgPxPerH = (deduped[deduped.length - 1].y - deduped[0].y) / (lastH - firstH);
      for (let h = firstH; h <= lastH; h++) {
        const ts = `${String(h).padStart(2, "0")}:00`;
        if (!deduped.find(d => d.time === ts)) {
          deduped.push({ y: deduped[0].y + (h - firstH) * avgPxPerH, time: ts });
        }
      }
      deduped.sort((a, b) => a.y - b.y);
    }
    timeScale.length = 0;
    timeScale.push(...deduped);
  }

  // ─── Filter blocks: remove time labels, UI noise, status bar ───────────────
  const topCutoff = imageHeight * 0.12;
  const bottomCutoff = imageHeight * 0.97;

  // topCutoff: use first time scale label position if available, otherwise 12%
  const effectiveTopCutoff = timeScale.length > 0
    ? Math.max(timeScale[0].y - 50, 0)  // slightly above the first time label
    : topCutoff;

  const courseBlocks = blocks.filter(b => {
    if (b.bounds.y < effectiveTopCutoff || b.bounds.y > bottomCutoff) return false;
    const xCenter = b.bounds.x + b.bounds.width / 2;
    if (xCenter < timeColumnMaxX) return false; // time column
    if (NOISE_PATTERNS.some(p => p.test(b.text.trim()))) return false;
    if (b.text.trim().length === 0) return false;
    // Skip pure numbers (time labels that OCR also detected as doc blocks)
    if (/^\d{1,2}(:\d{2})?$/.test(b.text.trim())) return false;
    if (/^\|?\s*\d{1,2}(:\d{2})?\s*$/.test(b.text.trim())) return false;
    return true;
  });

  if (courseBlocks.length === 0) return { columns: [], timeScale };

  // ─── Detect day headers from words ─────────────────────────────────────────
  const headers = sharedDetectHeaders(words, imageHeight);

  // ─── Assign blocks to columns ──────────────────────────────────────────────
  const cols: { dayOfWeek: number; blocks: DocBlock[] }[] = [];

  if (headers.length >= 2) {
    const sortedHeaders = [...headers].sort((a, b) => a.xCenter - b.xCenter);
    for (let i = 0; i < sortedHeaders.length; i++) {
      const leftBound = i === 0 ? timeColumnMaxX : (sortedHeaders[i - 1].xCenter + sortedHeaders[i].xCenter) / 2;
      const rightBound = i === sortedHeaders.length - 1 ? imageWidth : (sortedHeaders[i].xCenter + sortedHeaders[i + 1].xCenter) / 2;
      cols.push({ dayOfWeek: sortedHeaders[i].dayOfWeek, blocks: [] });
      for (const b of courseBlocks) {
        const xCenter = b.bounds.x + b.bounds.width / 2;
        if (xCenter >= leftBound && xCenter < rightBound) cols[cols.length - 1].blocks.push(b);
      }
    }
  } else {
    // No headers: build intervals via clustering for block assignment
    const pseudoBlocks: CVBlock[] = courseBlocks.map(b => ({
      x: b.bounds.x, y: b.bounds.y, width: b.bounds.width, height: b.bounds.height,
    }));
    const intervals = buildColumnIntervals({
      gridColumns: [],
      headers: [],
      cvBlocks: pseudoBlocks,
      timeColumnMaxX,
      imageWidth,
    });
    if (intervals.length > 0) {
      for (const iv of intervals) {
        cols.push({ dayOfWeek: iv.dayOfWeek, blocks: [] });
      }
      for (const b of courseBlocks) {
        const xCenter = b.bounds.x + b.bounds.width / 2;
        const day = assignDayByInterval(xCenter, intervals);
        const col = cols.find(c => c.dayOfWeek === day);
        if (col) col.blocks.push(b);
      }
    } else {
      cols.push({ dayOfWeek: 1, blocks: [...courseBlocks] });
    }
  }

  // ─── Group blocks into text groups by y-proximity ──────────────────────────
  // DocBlocks are already paragraph-level, so adjacent blocks with small y-gap
  // belong to the same course card. Large y-gaps = different courses.
  const allBlockHeights = courseBlocks.map(b => b.bounds.height).sort((a, b) => a - b);
  const medianBlockHeight = allBlockHeights[Math.floor(allBlockHeights.length / 2)] || 30;

  const columns: ColumnData[] = [];
  for (const col of cols) {
    const sorted = [...col.blocks].sort((a, b) => a.bounds.y - b.bounds.y);
    if (sorted.length === 0) continue;

    const groupGapThreshold = computeAdaptiveGapThreshold(
      sorted.map(b => ({ bounds: b.bounds })),
      medianBlockHeight,
    );

    const groups: TextGroup[] = [];
    let currentGroup: DocBlock[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prevBottom = currentGroup[currentGroup.length - 1].bounds.y + currentGroup[currentGroup.length - 1].bounds.height;
      const currentTop = sorted[i].bounds.y;
      if (currentTop - prevBottom > groupGapThreshold) {
        groups.push(docBlocksToTextGroup(currentGroup));
        currentGroup = [];
      }
      currentGroup.push(sorted[i]);
    }
    if (currentGroup.length > 0) groups.push(docBlocksToTextGroup(currentGroup));

    if (groups.length > 0) columns.push({ dayOfWeek: col.dayOfWeek, textGroups: groups });
  }

  return { columns, timeScale };
}

function docBlocksToTextGroup(blocks: DocBlock[]): TextGroup {
  return {
    yMin: Math.min(...blocks.map(b => b.bounds.y)),
    yMax: Math.max(...blocks.map(b => b.bounds.y + b.bounds.height)),
    texts: blocks.map(b => b.text.trim()).filter(t => t.length > 0),
  };
}
