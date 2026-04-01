// buhub_back/src/lib/schedule/dedup.ts
// Deduplication logic: time-tolerant matching (DEDUP-01) + gap-threshold same-name merging (DEDUP-02)
import type { ParsedCourse } from "./types";

// Named constants at module top (SCREAMING_SNAKE_CASE per project convention)
export const TIME_TOLERANCE_MINUTES = 5; // D-01: +-5min tolerance for OCR noise
export const SESSION_GAP_MINUTES = 30; // D-03: >30min gap = genuinely separate sessions

/** Convert "HH:mm" to total minutes since midnight. */
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Time-tolerant deduplication (DEDUP-01, D-01).
 * For same name + same day courses, if start time difference <= TIME_TOLERANCE_MINUTES
 * AND end time difference <= TIME_TOLERANCE_MINUTES, merge into one entry.
 * Uses "richest data" merge strategy (D-02 discretion): keeps longer non-empty location.
 */
export function dedup(courses: ParsedCourse[]): ParsedCourse[] {
  const result: ParsedCourse[] = [];
  for (const c of courses) {
    const match = result.find(
      (r) =>
        r.name === c.name &&
        r.dayOfWeek === c.dayOfWeek &&
        Math.abs(
          parseTimeToMinutes(r.startTime) - parseTimeToMinutes(c.startTime)
        ) <= TIME_TOLERANCE_MINUTES &&
        Math.abs(
          parseTimeToMinutes(r.endTime) - parseTimeToMinutes(c.endTime)
        ) <= TIME_TOLERANCE_MINUTES
    );
    if (match) {
      // "Richest data" merge: prefer longer location string (D-02)
      if (
        c.location &&
        (!match.location || c.location.length > match.location.length)
      ) {
        match.location = c.location;
      }
    } else {
      result.push({ ...c });
    }
  }
  return result;
}

/**
 * Resolve cross-course overlaps on the same day.
 * Sort courses by day + startTime. When two consecutive courses overlap,
 * trim the earlier course's endTime to the later course's startTime.
 */
export function resolveOverlaps(courses: ParsedCourse[]): ParsedCourse[] {
  let result = courses.map(c => ({ ...c }));

  // Run up to 3 passes to handle multi-overlap chains
  for (let pass = 0; pass < 3; pass++) {
    result.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    let changed = false;

    for (let i = 0; i < result.length - 1; i++) {
      const cur = result[i];
      const next = result[i + 1];
      if (cur.dayOfWeek !== next.dayOfWeek) continue;

      const curEnd = parseTimeToMinutes(cur.endTime);
      const nextStart = parseTimeToMinutes(next.startTime);
      if (curEnd > nextStart) {
        cur.endTime = next.startTime;
        changed = true;
      }
    }

    // Filter out courses that became zero/negative duration after trimming
    result = result.filter(c => parseTimeToMinutes(c.endTime) > parseTimeToMinutes(c.startTime));
    if (!changed) break;
  }

  return result;
}

/**
 * Gap-threshold same-name merging (DEDUP-02, D-03).
 * Groups by name + dayOfWeek, sorts by startTime.
 * Merges if gap between cur.endTime and next.startTime <= SESSION_GAP_MINUTES.
 * Preserves as separate entries if gap > SESSION_GAP_MINUTES.
 */
export function mergeSameName(courses: ParsedCourse[]): ParsedCourse[] {
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
      const gap =
        parseTimeToMinutes(next.startTime) - parseTimeToMinutes(cur.endTime);
      // gap <= 0 means overlap/adjacent, gap <= SESSION_GAP_MINUTES means close enough to merge
      if (gap <= SESSION_GAP_MINUTES) {
        // Extend end time if next extends beyond current
        if (parseTimeToMinutes(next.endTime) > parseTimeToMinutes(cur.endTime)) {
          cur.endTime = next.endTime;
        }
        // Merge locations: add new unique locations
        const locs = new Set(
          cur.location
            .split(", ")
            .filter(Boolean)
        );
        for (const l of next.location.split(", ").filter(Boolean)) locs.add(l);
        cur.location = Array.from(locs).join(", ");
      } else {
        // Gap > SESSION_GAP_MINUTES: genuinely different session, preserve separately
        result.push(cur);
        cur = { ...next };
      }
    }
    result.push(cur);
  }
  return result;
}
