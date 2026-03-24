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

  // Pre-compute startTime/endTime for each group using interpolation
  function interpolateTime(y: number): string {
    if (timeScale.length < 2) return "08:00";
    const parseT = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const toStr = (min: number) => {
      const snapped = Math.round(min / 30) * 30;
      return `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
    };
    if (y <= timeScale[0].y) return toStr(parseT(timeScale[0].time));
    if (y >= timeScale[timeScale.length - 1].y) return toStr(parseT(timeScale[timeScale.length - 1].time));
    for (let i = 0; i < timeScale.length - 1; i++) {
      if (y >= timeScale[i].y && y <= timeScale[i + 1].y) {
        const ratio = (y - timeScale[i].y) / (timeScale[i + 1].y - timeScale[i].y);
        const min = parseT(timeScale[i].time) + ratio * (parseT(timeScale[i + 1].time) - parseT(timeScale[i].time));
        return toStr(min);
      }
    }
    return toStr(parseT(timeScale[0].time));
  }

  // Format columns with pre-computed times
  const colsStr = columns.map(col => {
    const dayName = dayNames[col.dayOfWeek] || `Day${col.dayOfWeek}`;
    const groups = col.textGroups;
    // Compute preliminary endTimes
    // Non-last: nextBlock's startTime. Last: startTime + avgDuration from other consecutive pairs.
    const durations: number[] = [];
    const parseT = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const toStr = (min: number) => {
      const s = Math.round(min / 30) * 30;
      return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    };

    // First pass: collect durations from consecutive pairs
    for (let i = 0; i < groups.length - 1; i++) {
      const s = interpolateTime(groups[i].yMin);
      const e = interpolateTime(groups[i + 1].yMin);
      const dur = parseT(e) - parseT(s);
      if (dur > 0 && dur <= 240) durations.push(dur);
    }
    const medianDuration = durations.length > 0
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      : 180; // default 3h if no reference

    const groupsStr = groups.map((g, i) => {
      const startTime = interpolateTime(g.yMin);
      let endTime: string;
      if (i + 1 < groups.length) {
        endTime = interpolateTime(groups[i + 1].yMin);
      } else {
        // Last block: startTime + median duration
        endTime = toStr(parseT(startTime) + medianDuration);
      }
      return `  Group ${i + 1} (startTime=${startTime}, endTime=${endTime}):\n    ${g.texts.join("\n    ")}`;
    }).join("\n");
    return `Column: ${dayName} (dayOfWeek=${col.dayOfWeek})\n${groupsStr}`;
  }).join("\n\n");

  const prompt = `You are parsing a university timetable. I extracted text from the image with OCR. Each column is one weekday. Within each column, "groups" are clusters of text at specific y-pixel positions.

${scaleStr}

Each group has a startTime, endTime, and dayOfWeek that are ALREADY DETERMINED by code. DO NOT change them.

YOUR ONLY TASKS:
1. For each group, identify which text is a course code and which is a location.
2. Course codes: 2-5 uppercase letters + 4 digits (COMP3115, GCAP3105, MATH2225)
3. Locations: room codes (JC3_UG05, LMC512, FSC801C). If multiple rooms, join with comma.
4. Strip parenthesized content: "GCAP3105 (00001)" → "GCAP3105"
5. Copy dayOfWeek, startTime, endTime EXACTLY as given. Do NOT recalculate or modify them.
6. If a group has no recognizable course code, skip it.

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
