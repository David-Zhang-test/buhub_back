// buhub_back/src/lib/schedule/llm-parser.ts
import type { ParsedCourse, ColumnData, TimeScaleEntry } from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = "google/gemini-2.5-flash";

/**
 * Parse columns with raw text groups + time scale.
 * LLM determines startTime, endTime, merges same-name groups, identifies course name/location.
 */
export async function parseColumnsWithTimeInference(
  columns: ColumnData[],
  timeScale: TimeScaleEntry[]
): Promise<ParsedCourse[]> {
  if (columns.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Format time scale
  const scaleStr = timeScale.length >= 2
    ? `TIME SCALE (y pixel → time):\n${timeScale.map(t => `  y=${Math.round(t.y)}px → ${t.time}`).join("\n")}\nUse linear interpolation between labels to convert any y-position to a time.`
    : "No time scale available. Estimate times proportionally (top of grid ≈ 08:00, bottom ≈ 22:00).";

  // Format columns with text groups
  const colsStr = columns.map(col => {
    const dayName = dayNames[col.dayOfWeek] || `Day${col.dayOfWeek}`;
    const groupsStr = col.textGroups.map((g, i) =>
      `  Group ${i + 1} (y=${Math.round(g.yMin)}-${Math.round(g.yMax)}px):\n    ${g.texts.join("\n    ")}`
    ).join("\n");
    return `Column: ${dayName} (dayOfWeek=${col.dayOfWeek})\n${groupsStr}`;
  }).join("\n\n");

  const prompt = `You are parsing a university timetable. I extracted text from the image with OCR. Each column is one weekday. Within each column, "groups" are clusters of text at specific y-pixel positions.

${scaleStr}

HOW TO DETERMINE TIMES:
1. Each text group sits INSIDE a colored course block. The text is near the TOP of the block.
2. startTime: interpolate the group's yMin against the time scale.
3. endTime: the course block extends BELOW the text. To find where it ends:
   - Look at the NEXT group's yMin in the same column. The current block ends at or before the next block starts.
   - If there is a GAP between the current group's yMax and the next group's yMin that is larger than the group's own height, the block likely ends at a time scale mark BETWEEN the two groups. Pick the nearest :00 or :30 mark.
   - If groups are CLOSE together (gap < group height), they may be adjacent blocks with no break.
   - For the LAST group in a column: estimate endTime by comparing its text height to other blocks. If similar-sized groups elsewhere span 2-3 hours, use the same duration.
4. MERGING: If consecutive groups in the same column contain the SAME course code (e.g., two groups both say "COMP3115"), they are ONE course spanning the combined time range. Merge into a single record with startTime from the first group and endTime based on where the last group's block ends.

RULES:
- Course codes: 2-5 uppercase letters + 4 digits (COMP3115, GCAP3105, MATH2225)
- Strip parenthesized content: "GCAP3105 (00001)" → "GCAP3105"
- Locations: room codes (JC3_UG05, LMC512, FSC801C). Combine rooms from merged groups with comma.
- dayOfWeek is ALREADY DETERMINED — copy it exactly.
- Use 30-minute granularity: "HH:mm" format (e.g., "08:30", "11:30", "15:00").
- If a group has no recognizable course code, skip it.

DATA:
${colsStr}

Output: JSON array only. No markdown. No explanation.
[{"name":"COMP3115","location":"FSC801C, FSC801D","dayOfWeek":4,"startTime":"08:30","endTime":"11:30"}]`;

  return callLLM(apiKey, prompt);
}

// ─── Shared LLM call with retry ──────────────────────────────────────────────

async function callLLM(apiKey: string, prompt: string): Promise<ParsedCourse[]> {
  const doCall = async () => {
    const response = await fetch(OPENROUTER_API_URL, {
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
    if (!response.ok) throw new Error(`LLM API error ${response.status}`);
    const result = await response.json();
    return result.choices?.[0]?.message?.content?.trim() || "";
  };

  const content = await doCall();
  if (!content) return [];

  const courses = extractCoursesFromJSON(content);
  if (courses.length > 0) return courses;

  // Retry once if malformed
  const retryContent = await doCall();
  return retryContent ? extractCoursesFromJSON(retryContent) : [];
}

function extractCoursesFromJSON(content: string): ParsedCourse[] {
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
  } catch { return []; }
}
