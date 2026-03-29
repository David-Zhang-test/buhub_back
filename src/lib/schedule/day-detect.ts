// buhub_back/src/lib/schedule/day-detect.ts
// Shared day detection logic: header detection, column interval building, day assignment
import type { OCRWord, CVBlock, GridColumn, ColumnInterval } from "./types";

// ─── Day keywords (English full/abbreviated + Chinese) ──────────────────────

export const DAY_KEYWORDS: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  "\u4e00": 1, "\u4e8c": 2, "\u4e09": 3, "\u56db": 4, "\u4e94": 5, "\u516d": 6, "\u65e5": 7,
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

  // ─── Priority 1: Grid columns from Python CV ───────────────────────────
  if (filteredGrid.length >= 2) {
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
  // Determine day count
  const hasWeekend = headers.some(h => h.dayOfWeek > 5);
  let dayCount: number;
  if (headers.length > 0) {
    dayCount = hasWeekend ? 7 : headers.length;
  } else {
    dayCount = gridCols.length > 5 ? 7 : 5;
  }

  // Map headers to grid columns by nearest xCenter if headers exist
  const intervals: ColumnInterval[] = [];

  if (headers.length > 0) {
    // For each grid column, find the nearest header
    for (const gc of gridCols) {
      let bestHeader = headers[0];
      let bestDist = Infinity;
      for (const h of headers) {
        const dist = Math.abs(gc.center - h.xCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestHeader = h;
        }
      }
      intervals.push({
        dayOfWeek: bestHeader.dayOfWeek,
        xMin: gc.left,
        xMax: gc.right,
        xCenter: gc.center,
      });
    }
  } else {
    // No headers: assign sequentially 1..N
    for (let i = 0; i < gridCols.length; i++) {
      const gc = gridCols[i];
      const day = i + 1;
      if (day > dayCount) break;
      intervals.push({
        dayOfWeek: day,
        xMin: gc.left,
        xMax: gc.right,
        xCenter: gc.center,
      });
    }
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

  // Build intervals from clusters
  const intervals: ColumnInterval[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const cMin = Math.min(...cluster);
    const cMax = Math.max(...cluster);
    const day = i + 1;
    if (day > dayCount) break;

    intervals.push({
      dayOfWeek: day,
      xMin: cMin,
      xMax: cMax,
      xCenter: (cMin + cMax) / 2,
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
