// buhub_back/src/lib/schedule/day-detect.ts
// Shared day detection logic: header detection, column interval building, day assignment
import type { OCRWord, CVBlock, GridColumn, ColumnInterval, DayDetectionTier } from "./types";

// ─── Day keywords (English full/abbreviated + Chinese) ──────────────────────

export const DAY_KEYWORDS: Record<string, number> = {
  // English abbreviations + full forms
  mon: 1, tue: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  // Chinese single-char (一 / 二 / 三 / 四 / 五 / 六 / 日)
  "\u4e00": 1, "\u4e8c": 2, "\u4e09": 3, "\u56db": 4, "\u4e94": 5, "\u516d": 6, "\u65e5": 7,
  // Traditional Chinese prefixed (週一…)
  "\u9031\u4e00": 1, "\u9031\u4e8c": 2, "\u9031\u4e09": 3, "\u9031\u56db": 4,
  "\u9031\u4e94": 5, "\u9031\u516d": 6, "\u9031\u65e5": 7, "\u9031\u5929": 7,
  // Simplified Chinese prefixed (周一…)
  "\u5468\u4e00": 1, "\u5468\u4e8c": 2, "\u5468\u4e09": 3, "\u5468\u56db": 4,
  "\u5468\u4e94": 5, "\u5468\u516d": 6, "\u5468\u65e5": 7, "\u5468\u5929": 7,
  // Full form (星期一…)
  "\u661f\u671f\u4e00": 1, "\u661f\u671f\u4e8c": 2, "\u661f\u671f\u4e09": 3,
  "\u661f\u671f\u56db": 4, "\u661f\u671f\u4e94": 5, "\u661f\u671f\u516d": 6,
  "\u661f\u671f\u65e5": 7, "\u661f\u671f\u5929": 7,
};

// ─── Detect day headers from OCR words ──────────────────────────────────────

export function detectHeaders(
  words: OCRWord[],
  imageHeight: number,
): { dayOfWeek: number; xCenter: number }[] {
  // D-02: Expand scan region from 18% to 25% of image
  const region = imageHeight * 0.25;
  const raw: { dayOfWeek: number; xCenter: number }[] = [];

  for (const w of words) {
    if (w.bounds.y > region) continue;
    const key = w.text.trim().toLowerCase();
    if (DAY_KEYWORDS[key] !== undefined) {
      raw.push({
        dayOfWeek: DAY_KEYWORDS[key],
        xCenter: w.bounds.x + w.bounds.width / 2,
      });
    }
  }

  // Dedup: if multiple words resolve to the same dayOfWeek, keep leftmost (smallest xCenter)
  const deduped = new Map<number, { dayOfWeek: number; xCenter: number }>();
  // Sort by xCenter ascending first so the first encountered is the leftmost
  raw.sort((a, b) => a.xCenter - b.xCenter);
  for (const h of raw) {
    if (!deduped.has(h.dayOfWeek)) {
      deduped.set(h.dayOfWeek, h);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.xCenter - b.xCenter);
}

// ─── Grid reliability gate ─────────────────────────────────────────────────

/**
 * Returns false when CV grid detection is unreliable and headers should be
 * preferred. Two heuristics:
 * 1. Count mismatch — if OCR found 3+ headers but grid has significantly
 *    fewer columns, the grid detection missed most day boundaries.
 * 2. Width consistency — if the widest column is >2.5x the narrowest, the
 *    detected "columns" are likely noise (merged or split boundaries).
 */
function isGridReliable(
  filteredGrid: GridColumn[],
  headers: { dayOfWeek: number; xCenter: number }[],
): boolean {
  if (filteredGrid.length < 2) return false;

  // Check 1: headers available and grid has fewer columns than expected
  if (headers.length >= 3 && filteredGrid.length < headers.length) {
    return false;
  }

  // With zero day-header evidence, 2-4 grid columns can't be trusted as a
  // full-week schedule — require at least 5 before accepting grid-only detection.
  if (headers.length === 0 && filteredGrid.length < 5) {
    return false;
  }

  // Check 2: column width consistency
  const widths = filteredGrid.map(gc => gc.right - gc.left);
  const maxW = Math.max(...widths);
  const minW = Math.min(...widths);
  if (minW > 0 && maxW / minW > 2.5) {
    return false;
  }

  return true;
}

// ─── Build column intervals (3-tier priority chain) ─────────────────────────

export function buildColumnIntervals(params: {
  gridColumns: GridColumn[];
  headers: { dayOfWeek: number; xCenter: number }[];
  cvBlocks: CVBlock[];
  timeColumnMaxX: number;
  imageWidth: number;
}): ColumnInterval[] {
  const { gridColumns, headers, cvBlocks, timeColumnMaxX, imageWidth } = params;

  // Filter out grid columns where center < timeColumnMaxX (time column exclusion)
  const filteredGrid = gridColumns.filter(gc => gc.center >= timeColumnMaxX);

  // ─── Priority 1: Grid columns from Python CV (with reliability gate) ──
  const gridReliable = isGridReliable(filteredGrid, headers);
  if (filteredGrid.length >= 2 && gridReliable) {
    return buildFromGridColumns(filteredGrid, headers);
  }

  // ─── Priority 2: OCR headers ──────────────────────────────────────────
  if (headers.length >= 2) {
    return buildFromHeaders(headers, timeColumnMaxX, imageWidth);
  }

  // ─── Priority 3: Gap-based x-clustering of CV blocks ──────────────────
  return buildFromClustering(cvBlocks, timeColumnMaxX, imageWidth);
}

function buildFromGridColumns(
  gridCols: GridColumn[],
  headers: { dayOfWeek: number; xCenter: number }[],
): ColumnInterval[] {
  const sorted = [...gridCols].sort((a, b) => a.center - b.center);

  // Determine day count
  const hasWeekend = headers.some(h => h.dayOfWeek > 5);
  let dayCount: number;
  if (headers.length > 0) {
    dayCount = hasWeekend ? 7 : Math.max(headers.length, sorted.length);
  } else {
    dayCount = sorted.length > 5 ? 7 : 5;
  }

  if (headers.length === 0) {
    // No headers: assign sequentially 1..N
    const intervals: ColumnInterval[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const gc = sorted[i];
      const day = i + 1;
      if (day > dayCount) break;
      intervals.push({ dayOfWeek: day, xMin: gc.left, xMax: gc.right, xCenter: gc.center });
    }
    return intervals;
  }

  // ─── Greedy 1:1 anchor: each header claims its nearest unclaimed grid column ─
  const sortedHeaders = [...headers].sort((a, b) => a.xCenter - b.xCenter);
  const anchored = new Map<number, number>(); // gridIndex → dayOfWeek
  const claimed = new Set<number>();

  for (const h of sortedHeaders) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      if (claimed.has(i)) continue;
      const dist = Math.abs(sorted[i].center - h.xCenter);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      anchored.set(bestIdx, h.dayOfWeek);
      claimed.add(bestIdx);
    }
  }

  // ─── Interpolate unanchored columns between anchor points ─────────────────
  const dayAssignments: number[] = new Array(sorted.length).fill(0);
  for (const [idx, day] of anchored) dayAssignments[idx] = day;

  // Fill gaps by linear interpolation between anchors
  const anchorIndices = [...anchored.keys()].sort((a, b) => a - b);

  // Fill before first anchor
  if (anchorIndices.length > 0) {
    const firstAnchorIdx = anchorIndices[0];
    const firstAnchorDay = dayAssignments[firstAnchorIdx];
    for (let i = firstAnchorIdx - 1; i >= 0; i--) {
      dayAssignments[i] = Math.max(1, firstAnchorDay - (firstAnchorIdx - i));
    }

    // Fill after last anchor
    const lastAnchorIdx = anchorIndices[anchorIndices.length - 1];
    const lastAnchorDay = dayAssignments[lastAnchorIdx];
    for (let i = lastAnchorIdx + 1; i < sorted.length; i++) {
      dayAssignments[i] = Math.min(dayCount, lastAnchorDay + (i - lastAnchorIdx));
    }

    // Fill between anchors
    for (let a = 0; a < anchorIndices.length - 1; a++) {
      const leftIdx = anchorIndices[a];
      const rightIdx = anchorIndices[a + 1];
      const leftDay = dayAssignments[leftIdx];
      const rightDay = dayAssignments[rightIdx];
      const gapCols = rightIdx - leftIdx - 1;
      if (gapCols <= 0) continue;

      for (let i = 1; i <= gapCols; i++) {
        const ratio = i / (gapCols + 1);
        dayAssignments[leftIdx + i] = Math.round(leftDay + ratio * (rightDay - leftDay));
      }
    }
  }

  // Build intervals
  const intervals: ColumnInterval[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const gc = sorted[i];
    const day = dayAssignments[i] || (i + 1);
    if (day > dayCount) continue;
    intervals.push({ dayOfWeek: day, xMin: gc.left, xMax: gc.right, xCenter: gc.center });
  }

  return intervals.sort((a, b) => a.xMin - b.xMin);
}

function buildFromHeaders(
  headers: { dayOfWeek: number; xCenter: number }[],
  timeColumnMaxX: number,
  imageWidth: number,
): ColumnInterval[] {
  const sorted = [...headers].sort((a, b) => a.xCenter - b.xCenter);
  const intervals: ColumnInterval[] = [];

  for (let i = 0; i < sorted.length; i++) {
    let xMin: number;
    let xMax: number;

    if (i === 0) {
      // First column: from timeColumnMaxX to midpoint with next header
      xMin = timeColumnMaxX;
      xMax = (sorted[0].xCenter + sorted[1].xCenter) / 2;
    } else if (i === sorted.length - 1) {
      // Last column: from midpoint with previous to imageWidth
      xMin = (sorted[i - 1].xCenter + sorted[i].xCenter) / 2;
      xMax = imageWidth;
    } else {
      // Middle columns: midpoints of adjacent headers
      xMin = (sorted[i - 1].xCenter + sorted[i].xCenter) / 2;
      xMax = (sorted[i].xCenter + sorted[i + 1].xCenter) / 2;
    }

    intervals.push({
      dayOfWeek: sorted[i].dayOfWeek,
      xMin,
      xMax,
      xCenter: sorted[i].xCenter,
    });
  }

  return intervals;
}

function buildFromClustering(
  cvBlocks: CVBlock[],
  timeColumnMaxX: number,
  imageWidth: number,
): ColumnInterval[] {
  if (cvBlocks.length === 0) return [];

  // Compute x-centers of all CV blocks, filter those past the time column
  const xCenters = cvBlocks
    .map(b => b.x + b.width / 2)
    .filter(x => x >= timeColumnMaxX)
    .sort((a, b) => a - b);

  if (xCenters.length === 0) return [];

  // Find gaps between consecutive x-centers
  const gaps: number[] = [];
  for (let i = 1; i < xCenters.length; i++) {
    gaps.push(xCenters[i] - xCenters[i - 1]);
  }

  // Compute median gap
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps.length > 0
    ? sortedGaps[Math.floor(sortedGaps.length / 2)]
    : 0;

  // Cluster threshold
  const clusterThreshold = Math.max(medianGap * 2, imageWidth * 0.05);

  // Split into clusters
  const clusters: number[][] = [[xCenters[0]]];
  for (let i = 1; i < xCenters.length; i++) {
    if (xCenters[i] - xCenters[i - 1] > clusterThreshold) {
      clusters.push([]);
    }
    clusters[clusters.length - 1].push(xCenters[i]);
  }

  // D-06: day count determination
  const dayCount = clusters.length > 5 ? 7 : 5;

  // Compute cluster centers and inter-cluster gaps
  const clusterCenters = clusters.map(c => {
    const cMin = Math.min(...c);
    const cMax = Math.max(...c);
    return { cMin, cMax, center: (cMin + cMax) / 2 };
  });

  // Detect skipped days: if inter-cluster gap is >1.5x median spacing, insert gap
  const spacings: number[] = [];
  for (let i = 1; i < clusterCenters.length; i++) {
    spacings.push(clusterCenters[i].center - clusterCenters[i - 1].center);
  }
  const medianSpacing = spacings.length > 0
    ? [...spacings].sort((a, b) => a - b)[Math.floor(spacings.length / 2)]
    : 0;

  // Assign day numbers, inserting gaps for large spacings
  const dayNumbers: number[] = [1];
  for (let i = 1; i < clusterCenters.length; i++) {
    const prevDay = dayNumbers[i - 1];
    if (medianSpacing > 0 && spacings[i - 1] > medianSpacing * 1.5) {
      // Large gap: estimate how many days were skipped
      const skippedDays = Math.round(spacings[i - 1] / medianSpacing) - 1;
      dayNumbers.push(Math.min(dayCount, prevDay + 1 + skippedDays));
    } else {
      dayNumbers.push(Math.min(dayCount, prevDay + 1));
    }
  }

  // Build intervals from clusters with gap-aware day numbers
  const intervals: ColumnInterval[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const { cMin, cMax, center } = clusterCenters[i];
    const day = dayNumbers[i];
    if (day > dayCount) break;

    intervals.push({
      dayOfWeek: day,
      xMin: cMin,
      xMax: cMax,
      xCenter: center,
    });
  }

  // Widen intervals to cover gaps between clusters
  for (let i = 0; i < intervals.length - 1; i++) {
    const midGap = (intervals[i].xMax + intervals[i + 1].xMin) / 2;
    intervals[i].xMax = midGap;
    intervals[i + 1].xMin = midGap;
  }

  // Extend first interval left to timeColumnMaxX
  if (intervals.length > 0) {
    intervals[0].xMin = timeColumnMaxX;
  }

  // Extend last interval right to imageWidth
  if (intervals.length > 0) {
    intervals[intervals.length - 1].xMax = imageWidth;
  }

  return intervals;
}

// ─── Which tier did buildColumnIntervals take? (mirrors the priority chain) ─

/**
 * Returns which priority tier `buildColumnIntervals` would use for the same
 * inputs, without running the full column-interval construction. Used to
 * surface confidence to the caller (tier 3 means columns were guessed from
 * block positions with no day-header evidence).
 */
export function determineDayDetectionTier(params: {
  gridColumns: GridColumn[];
  headers: { dayOfWeek: number; xCenter: number }[];
  timeColumnMaxX: number;
}): DayDetectionTier {
  const { gridColumns, headers, timeColumnMaxX } = params;
  const filteredGrid = gridColumns.filter(gc => gc.center >= timeColumnMaxX);
  if (filteredGrid.length >= 2 && isGridReliable(filteredGrid, headers)) return 1;
  if (headers.length >= 2) return 2;
  return 3;
}

// ─── Assign dayOfWeek using interval-based lookup (D-05) ────────────────────

export function assignDayByInterval(
  blockCenterX: number,
  intervals: ColumnInterval[],
): number {
  if (intervals.length === 0) return 1;

  // Find the interval where blockCenterX falls within [xMin, xMax)
  // For the last interval, use inclusive right boundary [xMin, xMax]
  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i];
    const isLast = i === intervals.length - 1;
    if (isLast) {
      if (blockCenterX >= iv.xMin && blockCenterX <= iv.xMax) {
        return iv.dayOfWeek;
      }
    } else {
      if (blockCenterX >= iv.xMin && blockCenterX < iv.xMax) {
        return iv.dayOfWeek;
      }
    }
  }

  // Fallback: nearest interval by center distance
  let bestInterval = intervals[0];
  let bestDist = Infinity;
  for (const iv of intervals) {
    const dist = Math.abs(blockCenterX - iv.xCenter);
    if (dist < bestDist) {
      bestDist = dist;
      bestInterval = iv;
    }
  }
  return bestInterval.dayOfWeek;
}
