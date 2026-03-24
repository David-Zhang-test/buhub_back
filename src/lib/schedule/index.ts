// buhub_back/src/lib/schedule/index.ts
import { detectText } from "./ocr";
import { groupWordsIntoCourseBlocks } from "./grouping";
import { parseCourseBlocks } from "./llm-parser";
import type { ParsedCourse } from "./types";

export type { ParsedCourse } from "./types";

/**
 * Parse a timetable image into structured course data.
 * Pipeline: OCR (coordinates) → Code (grouping) → LLM (semantics)
 */
export async function parseScheduleImage(imageUrl: string): Promise<ParsedCourse[]> {
  // Stage 1: OCR text detection
  console.log("[schedule] Stage 1: OCR text detection...");
  const { words, imageWidth, imageHeight } = await detectText(imageUrl);
  console.log(`[schedule] OCR found ${words.length} words (${imageWidth}x${imageHeight})`);

  if (words.length === 0) return [];

  // Stage 2: Coordinate-based grouping
  console.log("[schedule] Stage 2: Coordinate grouping...");
  const blocks = groupWordsIntoCourseBlocks(words, imageWidth, imageHeight);
  console.log(`[schedule] Found ${blocks.length} course blocks`);

  if (blocks.length === 0) return [];

  // Stage 3: LLM semantic parsing
  console.log("[schedule] Stage 3: LLM parsing...");
  const courses = await parseCourseBlocks(blocks);
  console.log(`[schedule] Parsed ${courses.length} courses`);

  // Post-processing: merge exact duplicates
  const mergeKey = (c: ParsedCourse) => `${c.name}|${c.dayOfWeek}|${c.startTime}|${c.endTime}`;
  const merged = new Map<string, ParsedCourse>();
  for (const course of courses) {
    const key = mergeKey(course);
    const existing = merged.get(key);
    if (existing) {
      if (course.location && !existing.location.includes(course.location)) {
        existing.location = existing.location ? `${existing.location}, ${course.location}` : course.location;
      }
    } else {
      merged.set(key, { ...course });
    }
  }

  const finalCourses = Array.from(merged.values());
  console.log(`[schedule] Final: ${finalCourses.length} courses after dedup`);
  return finalCourses;
}
