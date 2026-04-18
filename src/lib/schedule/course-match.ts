// buhub_back/src/lib/schedule/course-match.ts
// Course matching logic: widened course code regex, adjacent-token merging,
// spatial-position-based classification, and HKBU room code disambiguation.
import type { ParsedCourse } from "./types";

// ─── Course code pattern (MATCH-01) ────────────────────────────────────────
// Matches 2-4 uppercase letters, optional separator (dash/space), 3-4 digits,
// and an optional 1-3 letter suffix for section/type codes
// (e.g., "CHEM2810L", "PHIL1007LEC", "COMP3115L").
// [-\s]* handles OCR artifacts like "COMP - 3115" (spaces around dash).
export const COURSE_CODE_PATTERN = /^[A-Z]{2,4}[-\s]*\d{3,4}[A-Z]{0,3}$/;

// ─── Room code pattern (D-04) ──────────────────────────────────────────────
// Matches 2-3 uppercase letters + 3-4 digits, with optional 1-letter section
// suffix (e.g. "FSC801C", "FSC901D"). Multi-letter suffixes (LEC, TUT, LAB)
// stay out so they remain classified as course codes.
export const ROOM_CODE_PATTERN = /^[A-Z]{2,3}\d{3,4}[A-Z]?$/;

// ─── Known HKBU room prefixes (D-06) ──────────────────────────────────────
const KNOWN_ROOM_PREFIXES: readonly string[] = [
  "OEM", "DLB", "AAB", "WLB", "CVA", "FSC", "RRS",
  "SCM", "SWT", "ACC", "OEE", "SCT", "JAS", "ACA", "LMC",
];

// ─── Room code disambiguation ──────────────────────────────────────────────

/**
 * Returns true if the text matches ROOM_CODE_PATTERN AND its prefix is in
 * the known HKBU room prefix list.
 */
function isLikelyRoomCode(text: string): boolean {
  if (!ROOM_CODE_PATTERN.test(text)) return false;
  // Extract the leading letter prefix (rooms may have a trailing section
  // letter like FSC901E, so stripping trailing digits alone isn't enough).
  const prefixMatch = text.match(/^([A-Z]+)\d/);
  if (!prefixMatch) return false;
  return KNOWN_ROOM_PREFIXES.includes(prefixMatch[1]);
}

// ─── OCR confusion repair ──────────────────────────────────────────────────

/**
 * Try to recover a course code from OCR output that confused a digit for a
 * letter in the alphabetic prefix (e.g. "BUS13006" → "BUSI3006",
 * "C0MP3115" → "COMP3115"). Returns the repaired string if the candidate
 * matches COURSE_CODE_PATTERN, otherwise returns the original input.
 *
 * Only repairs 1→I and 0→O in the leading prefix; does not touch the digits
 * section so real course numbers like "1007" stay intact.
 */
export function repairOCRConfusion(text: string): string {
  if (COURSE_CODE_PATTERN.test(text)) return text;
  // Only attempt when the token has a plausible course-code shape:
  // 1-4 alphanumeric chars (prefix-ish) followed by 3-4 digits and an
  // optional letter suffix.
  const shape = text.match(/^([A-Z0-9]{1,4})(\d{3,4})([A-Z]{0,3})$/);
  if (!shape) return text;
  const [, prefix, digits, suffix] = shape;
  const repaired = prefix.replace(/1/g, "I").replace(/0/g, "O") + digits + suffix;
  if (/^[A-Z]{2,4}$/.test(repaired.slice(0, prefix.length)) && COURSE_CODE_PATTERN.test(repaired)) {
    return repaired;
  }
  return text;
}

// ─── OCR split-code merging (MATCH-01) ─────────────────────────────────────

/**
 * Scans for adjacent pairs where texts[i] is 2-4 uppercase letters and
 * texts[i+1] is 3-4 digits, then concatenates them.
 * Strips bracket content from each element first.
 */
export function mergeAdjacentCourseTokens(texts: string[]): string[] {
  const cleaned = texts.map((t) =>
    t.replace(/\s*\([^)]*\)\s*/g, "").trim()
  );
  const result: string[] = [];
  let i = 0;

  while (i < cleaned.length) {
    if (
      i + 1 < cleaned.length &&
      /^[A-Z]{2,4}$/.test(cleaned[i]) &&
      /^\d{3,4}$/.test(cleaned[i + 1])
    ) {
      result.push(cleaned[i] + cleaned[i + 1]);
      i += 2;
    } else {
      result.push(cleaned[i]);
      i += 1;
    }
  }

  return result;
}

// ─── Card input type ───────────────────────────────────────────────────────

interface CardInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  texts: string[];
}

// ─── Course identification (MATCH-02, MATCH-03) ────────────────────────────

/**
 * Two-pass classification of card texts into course names and locations.
 *
 * Pass 1 (D-05 priority): Mark texts matching COURSE_CODE_PATTERN as course
 * codes. Record the index of the first code found. Normalize matched codes
 * by stripping dashes/spaces (D-02).
 *
 * Pass 2 (D-03 spatial): For remaining non-code texts whose index is
 * greater than firstCodeIndex, classify as location candidates if they
 * are known room codes or have both letters and digits.
 */
export function identifyCourses(cards: CardInput[]): ParsedCourse[] {
  const results: ParsedCourse[] = [];

  for (const card of cards) {
    // Pre-processing: strip brackets, trim, merge adjacent tokens
    const stripped = card.texts.map((t) =>
      t.replace(/\s*\([^)]*\)\s*/g, "").trim()
    );
    const merged = mergeAdjacentCourseTokens(stripped);
    const processedTexts = merged.map((t) => repairOCRConfusion(t));

    const courseNames: string[] = [];
    const locations: string[] = [];
    let firstCodeIndex = -1;

    // Pass 1: Identify course codes (D-05 priority)
    // If a text matches COURSE_CODE_PATTERN but is a known room code,
    // skip it -- it will be handled as location in Pass 2.
    for (let i = 0; i < processedTexts.length; i++) {
      const text = processedTexts[i];
      if (text.length === 0) continue;

      if (COURSE_CODE_PATTERN.test(text) && !isLikelyRoomCode(text)) {
        if (firstCodeIndex < 0) firstCodeIndex = i;
        // D-02: Normalize by stripping dashes and spaces
        const normalized = text.replace(/[-\s]/g, "");
        if (!courseNames.includes(normalized)) {
          courseNames.push(normalized);
        }
      }
    }

    if (courseNames.length === 0) continue;

    // Pass 2: Classify remaining texts as location (spatial: only below first code)
    for (let i = 0; i < processedTexts.length; i++) {
      const text = processedTexts[i];
      if (text.length === 0) continue;

      // Skip texts that are course codes (already classified in Pass 1)
      // But don't skip known room codes -- they were excluded from Pass 1
      if (COURSE_CODE_PATTERN.test(text) && !isLikelyRoomCode(text)) continue;

      // Skip pure numbers, single chars, punctuation
      if (/^\d+$/.test(text) || text.length <= 1 || /^[^A-Za-z0-9]+$/.test(text)) continue;

      // D-03 spatial: only consider texts below the first course code
      if (i <= firstCodeIndex || firstCodeIndex < 0) continue;

      // Check if it's a known room code
      if (isLikelyRoomCode(text)) {
        if (!locations.includes(text)) locations.push(text);
        continue;
      }

      // Existing heuristic: has both letters and digits (but only below code)
      if (/[A-Z]/i.test(text) && /\d/.test(text)) {
        if (!locations.includes(text)) locations.push(text);
      }
    }

    // Build results: one ParsedCourse per unique course name
    for (const name of courseNames) {
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
