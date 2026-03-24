// buhub_back/src/lib/schedule/llm-parser.ts
import type { CourseBlock, ParsedCourse } from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = "google/gemini-2.5-flash";

export async function parseCourseBlocks(blocks: CourseBlock[]): Promise<ParsedCourse[]> {
  if (blocks.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Format blocks as readable text for LLM
  const formatted = blocks.map((b, i) =>
    `Block ${i + 1} (${dayNames[b.dayOfWeek] || "?"}, dayOfWeek=${b.dayOfWeek}, ${b.startTime}-${b.endTime}):\n  ${b.texts.join("\n  ")}`
  ).join("\n\n");

  const prompt = `Parse the following timetable data into course records.
Each block contains text lines from a single course entry.
The dayOfWeek, startTime, and endTime are ALREADY DETERMINED — copy them exactly, do not change them.

Your job: identify which text is the course code and which is the location.

Rules:
- Course codes: 2-5 uppercase letters + 4 digits (GCAP3105, COMP2016, MATH2225, OEE702)
- Strip parenthesized content: "GCAP3105 (00001)" -> "GCAP3105"
- Locations: room codes like JC3_UG05, LMC512, AAB506, FSC801C
- If multiple room codes appear in one block, join with comma
- If a block contains multiple distinct course codes, create one record per course code (same dayOfWeek and time)
- If a block has no recognizable course code, skip it

Data:
${formatted}

Output: JSON array only. No markdown. No explanation.
[{"name":"GCAP3105","location":"JC3_UG05","dayOfWeek":4,"startTime":"09:30","endTime":"12:30"}]`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) return [];

  // Try parsing, retry LLM once if malformed
  const courses = extractCoursesFromJSON(content);
  if (courses.length > 0) return courses;

  // Retry once with same prompt
  console.log("[schedule] LLM returned unparseable JSON, retrying...");
  const retryResponse = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (retryResponse.ok) {
    const retryResult = await retryResponse.json();
    const retryContent = retryResult.choices?.[0]?.message?.content?.trim();
    if (retryContent) return extractCoursesFromJSON(retryContent);
  }

  return [];
}

function extractCoursesFromJSON(content: string): ParsedCourse[] {
  // Try parsing as JSON array
  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (!arrMatch) return [];

  try {
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => ({
      name: String(item.name || "").replace(/\s*\([^)]*\)\s*/g, "").trim(),
      location: String(item.location || ""),
      dayOfWeek: Math.min(7, Math.max(1, Number(item.dayOfWeek) || 1)),
      startTime: String(item.startTime || "08:00"),
      endTime: String(item.endTime || "09:00"),
    })).filter((c: ParsedCourse) => c.name.length > 0);
  } catch {
    return [];
  }
}
