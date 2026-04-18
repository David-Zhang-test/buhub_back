// buhub_back/src/lib/schedule/dedup.ts
// Deduplication logic: time-tolerant matching (DEDUP-01) + gap-threshold same-name merging (DEDUP-02)
import type { ParsedCourse } from "./types";

// Named constants at module top (SCREAMING_SNAKE_CASE per project convention)
export const TIME_TOLERANCE_MINUTES = 5; // D-01: +-5min tolerance for OCR noise
// Gap threshold for merging same-name back-to-back sessions. 5min tolerates
// OCR noise from block boundaries but keeps genuinely back-to-back sessions
// (e.g. different sections of the same course) separate.
export const SESSION_GAP_MINUTES = 5;

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
 * Return true when two comma-separated location strings are equivalent — that
 * is, identical token sets, or at least one side empty (treated as unknown).
 * A strict subset is NOT equivalent: if one block lists {A, B, C, D} and an
 * adjacent block lists {A, B}, they represent different sessions (e.g. a
 * combined lecture followed by a tutorial for a subset of sections).
 */
function locationsEquivalent(a: string, b: string): boolean {
  const toksA = new Set(a.split(",").map((s) => s.trim()).filter(Boolean));
  const toksB = new Set(b.split(",").map((s) => s.trim()).filter(Boolean));
  if (toksA.size === 0 || toksB.size === 0) return true;
  if (toksA.size !== toksB.size) return false;
  for (const t of toksA) if (!toksB.has(t)) return false;
  return true;
}

/**
 * Gap-threshold same-name merging (DEDUP-02, D-03).
 * Groups by name + dayOfWeek, sorts by startTime.
 * Merges if gap between cur.endTime and next.startTime <= SESSION_GAP_MINUTES
 * AND their locations are not demonstrably different. Preserves as separate
 * entries if gap > SESSION_GAP_MINUTES, or if both have non-empty locations
 * with zero overlap (e.g. back-to-back sections of the same course in
 * different rooms).
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
      const canMerge =
        gap <= SESSION_GAP_MINUTES && locationsEquivalent(cur.location, next.location);
      if (canMerge) {
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
        // Gap > SESSION_GAP_MINUTES, or locations demonstrably different:
        // genuinely distinct session, preserve separately.
        result.push(cur);
        cur = { ...next };
      }
    }
    result.push(cur);
  }
  return result;
}
