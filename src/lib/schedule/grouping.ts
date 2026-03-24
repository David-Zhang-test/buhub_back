// buhub_back/src/lib/schedule/grouping.ts
import type { OCRWord, CourseBlock } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Snap minutes to nearest :00 or :30 */
function snapTo30(minutes: number): number {
  return Math.round(minutes / 30) * 30;
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

/** Day header keywords → dayOfWeek */
const DAY_KEYWORDS: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7,
};

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
  const timePattern = /^\d{1,2}(:\d{2})?$/;
  const timeWords = words.filter(w => timePattern.test(w.text.trim()));

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
  const headerRegion = imageHeight * 0.18; // headers in top 18%
  const headers: { text: string; dayOfWeek: number; xCenter: number }[] = [];

  for (const w of words) {
    if (w.bounds.y > headerRegion) continue;
    const key = w.text.trim().toLowerCase();
    if (DAY_KEYWORDS[key] !== undefined) {
      headers.push({
        text: w.text.trim(),
        dayOfWeek: DAY_KEYWORDS[key],
        xCenter: w.bounds.x + w.bounds.width / 2,
      });
    }
  }
  headers.sort((a, b) => a.xCenter - b.xCenter);

  // ─── Step 4: Cluster by x-coordinate → columns ──────────────────────────
  const xCenters = courseWords.map(w => w.bounds.x + w.bounds.width / 2).sort((a, b) => a - b);

  // Gap-based clustering
  const gaps: { index: number; gap: number }[] = [];
  for (let i = 1; i < xCenters.length; i++) {
    gaps.push({ index: i, gap: xCenters[i] - xCenters[i - 1] });
  }
  const sortedGaps = [...gaps].sort((a, b) => a.gap - b.gap);
  const medianGap = sortedGaps.length > 0 ? sortedGaps[Math.floor(sortedGaps.length / 2)].gap : 0;
  const clusterThreshold = Math.max(medianGap * 2, imageWidth * 0.05);

  const columns: { xMin: number; xMax: number; xCenter: number; words: OCRWord[] }[] = [];
  let currentCluster: number[] = [xCenters[0]];

  for (let i = 1; i < xCenters.length; i++) {
    if (xCenters[i] - xCenters[i - 1] > clusterThreshold) {
      const clusterCenter = (Math.min(...currentCluster) + Math.max(...currentCluster)) / 2;
      const clusterMin = Math.min(...currentCluster);
      const clusterMax = Math.max(...currentCluster);
      columns.push({ xMin: clusterMin, xMax: clusterMax, xCenter: clusterCenter, words: [] });
      currentCluster = [];
    }
    currentCluster.push(xCenters[i]);
  }
  if (currentCluster.length > 0) {
    columns.push({
      xMin: Math.min(...currentCluster),
      xMax: Math.max(...currentCluster),
      xCenter: (Math.min(...currentCluster) + Math.max(...currentCluster)) / 2,
      words: [],
    });
  }

  // Assign words to nearest column
  for (const w of courseWords) {
    const wCenter = w.bounds.x + w.bounds.width / 2;
    let bestCol = 0;
    let bestDist = Infinity;
    for (let i = 0; i < columns.length; i++) {
      const dist = Math.abs(wCenter - columns[i].xCenter);
      if (dist < bestDist) { bestDist = dist; bestCol = i; }
    }
    columns[bestCol].words.push(w);
  }

  // ─── Step 5: Assign dayOfWeek to each column ────────────────────────────
  const headerUsageCount = new Map<number, number>(); // dayOfWeek → assignment count
  for (let i = 0; i < columns.length; i++) {
    if (headers.length > 0) {
      // Map to nearest header, break ties by fewer existing assignments
      let bestHeader = headers[0];
      let bestDist = Infinity;
      for (const h of headers) {
        const dist = Math.abs(columns[i].xCenter - h.xCenter);
        const usage = headerUsageCount.get(h.dayOfWeek) || 0;
        const bestUsage = headerUsageCount.get(bestHeader.dayOfWeek) || 0;
        if (dist < bestDist || (dist === bestDist && usage < bestUsage)) {
          bestDist = dist;
          bestHeader = h;
        }
      }
      (columns[i] as any).dayOfWeek = bestHeader.dayOfWeek;
      headerUsageCount.set(bestHeader.dayOfWeek, (headerUsageCount.get(bestHeader.dayOfWeek) || 0) + 1);
    } else {
      // Sequential assignment
      (columns[i] as any).dayOfWeek = i + 1;
    }
  }

  // ─── Step 6: Group words into blocks within each column ──────────────────
  const allHeights = courseWords.map(w => w.bounds.height).sort((a, b) => a - b);
  const medianHeight = allHeights[Math.floor(allHeights.length / 2)] || 20;
  const blockGapThreshold = medianHeight * 2.5;

  const blocks: CourseBlock[] = [];

  for (const col of columns) {
    const colWords = [...col.words].sort((a, b) => a.bounds.y - b.bounds.y);
    if (colWords.length === 0) continue;

    let currentBlock: OCRWord[] = [colWords[0]];

    for (let i = 1; i < colWords.length; i++) {
      const prevBottom = currentBlock[currentBlock.length - 1].bounds.y + currentBlock[currentBlock.length - 1].bounds.height;
      const currentTop = colWords[i].bounds.y;

      if (currentTop - prevBottom > blockGapThreshold) {
        // Flush current block
        blocks.push(buildBlock(currentBlock, (col as any).dayOfWeek, timeYMap, imageHeight));
        currentBlock = [];
      }
      currentBlock.push(colWords[i]);
    }
    if (currentBlock.length > 0) {
      blocks.push(buildBlock(currentBlock, (col as any).dayOfWeek, timeYMap, imageHeight));
    }
  }

  return blocks;
}

function buildBlock(
  words: OCRWord[],
  dayOfWeek: number,
  timeYMap: { y: number; minutes: number }[],
  imageHeight: number
): CourseBlock {
  const topY = Math.min(...words.map(w => w.bounds.y));
  const bottomY = Math.max(...words.map(w => w.bounds.y + w.bounds.height));
  const texts = words.map(w => w.text.trim()).filter(t => t.length > 0);

  let startTime: string;
  let endTime: string;

  if (timeYMap.length >= 2) {
    // Interpolate from time scale
    startTime = minutesToTime(snapTo30(interpolateTime(topY, timeYMap)));
    endTime = minutesToTime(snapTo30(interpolateTime(bottomY, timeYMap)));
  } else {
    // Proportional fallback (08:00 to 22:00)
    const startMin = snapTo30(480 + (topY / imageHeight) * (22 - 8) * 60);
    const endMin = snapTo30(480 + (bottomY / imageHeight) * (22 - 8) * 60);
    startTime = minutesToTime(startMin);
    endTime = minutesToTime(Math.max(endMin, startMin + 30));
  }

  // Ensure minimum 30 min duration
  if (startTime === endTime) {
    const startMin = parseInt(startTime.split(":")[0]) * 60 + parseInt(startTime.split(":")[1]);
    endTime = minutesToTime(startMin + 60);
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
