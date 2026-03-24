import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.5-flash";

function timeToMinutes(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

interface ParsedCourse {
  name: string;
  location: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface GridAnalysis {
  columns: number;
  dayHeaders: string[] | null;
  timeScale: { start: string; end: string; interval: number } | null;
  hasTimeScale: boolean;
  hasDayHeaders: boolean;
}

/**
 * Convert an image to base64 data URI.
 */
async function imageToBase64(imageUrl: string): Promise<string> {
  // Local uploaded file
  const uploadsMatch = imageUrl.match(/\/(?:api\/)?uploads\/(.+)$/);
  if (uploadsMatch) {
    const uploadsDir = path.resolve(process.cwd(), "public/uploads");
    const filePath = path.join(uploadsDir, uploadsMatch[1]);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
  }

  // Absolute file path
  if (imageUrl.startsWith("file://") || (imageUrl.startsWith("/") && fs.existsSync(imageUrl))) {
    const filePath = imageUrl.replace("file://", "");
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  // Remote URL — fetch and convert
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

/**
 * Call the vision model with a prompt and image.
 */
async function callVisionModel(
  apiKey: string,
  base64Image: string,
  prompt: string,
  maxTokens: number = 4096
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: base64Image } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(`API error: ${result.error.message || JSON.stringify(result.error)}`);
  }

  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`Empty response: ${JSON.stringify(result).slice(0, 500)}`);
  }

  return content;
}

/**
 * Extract JSON from model response text — handles both raw arrays and { courses: [...] } wrappers.
 */
function extractJSON(content: string): unknown[] {
  let parsed: unknown;

  // Try parsing as a JSON object with "courses" key first
  const objMatch = content.match(/\{[\s\S]*"courses"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]) as { courses?: unknown };
      if (Array.isArray(obj.courses)) {
        parsed = obj.courses;
      }
    } catch {
      // Fall through to array extraction
    }
  }

  // Fall back to extracting a plain JSON array
  if (!parsed) {
    const arrMatch = content.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      throw new Error(`No JSON found in response: ${content.slice(0, 300)}`);
    }
    try {
      parsed = JSON.parse(arrMatch[0]);
    } catch {
      throw new Error(`Failed to parse JSON: ${arrMatch[0].slice(0, 300)}`);
    }
  }

  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed;
}

// ─── Stage 1: Analyze grid structure ─────────────────────────────────────────

const GRID_ANALYSIS_PROMPT = `Analyze this timetable image's GRID STRUCTURE only. Do NOT extract course names or times yet.

Examine the image carefully and answer all four questions:

1. TIME SCALE: Look along the LEFT edge and TOP edge for time labels.
   HKBU has two scale formats — detect which one is present:
   - Half-hour scale: labels end in ":30" → e.g., "08:30", "09:30", "10:30", "11:30"
     → Set timeInterval=60 (each row is 1 hour; the label marks the middle/start of the hour slot)
   - Integer-hour scale: bare integers with no colon → e.g., "08", "09", "10", "11", "23"
     → Convert to HH:00 format in timeLabels (e.g., "08" → "08:00")
     → Set timeInterval=60
   - No scale visible at all → set hasTimeScale=false, timeLabels=[]

2. DAY HEADERS: Look for day-of-week labels across the TOP of the grid.
   - English: "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
   - Chinese: "一", "二", "三", "四", "五", "六", "日"
   - May be partially cropped (e.g., only "TUE", "WED", "THU", "FRI", "SAT" visible — the "MON" column scrolled off screen)
   - List only the headers you can actually read; do NOT invent headers for cropped columns
   - If no day headers visible → set hasDayHeaders=false, dayHeaders=[]

3. COLUMNS: Count the number of distinct vertical columns of course blocks (not counting the time label column).

4. TIME INTERVAL: The time gap between consecutive scale labels in minutes.
   - Both HKBU formats above → 60 minutes

Return JSON only. No markdown. No explanation.

Examples:
HKBU web (half-hour scale): {"hasTimeScale":true,"timeLabels":["08:30","09:30","10:30","11:30","12:30","13:30","14:30","15:30","16:30","17:30","18:30","19:30","20:30","21:30"],"timeInterval":60,"hasDayHeaders":true,"dayHeaders":["Mon","Tue","Wed","Thu","Fri","Sat"],"columns":6}
HKBU mobile (integer scale): {"hasTimeScale":true,"timeLabels":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"],"timeInterval":60,"hasDayHeaders":true,"dayHeaders":["Mon","Tue","Wed","Thu","Fri"],"columns":5}
No time scale visible: {"hasTimeScale":false,"timeLabels":[],"timeInterval":60,"hasDayHeaders":true,"dayHeaders":["Tue","Wed","Thu","Fri","Sat"],"columns":5}
No scale, no headers: {"hasTimeScale":false,"timeLabels":[],"timeInterval":60,"hasDayHeaders":false,"dayHeaders":[],"columns":3}`;

// ─── Stage 2: Extract courses using grid context ─────────────────────────────

// MODL-04: Excel/Word manual table support is deferred — no test samples available yet.
function buildExtractionPrompt(gridAnalysis: GridAnalysis): string {
  let gridContext = "";

  if (gridAnalysis.hasTimeScale && gridAnalysis.timeScale) {
    const { start, end, interval } = gridAnalysis.timeScale;
    const isHalfHourScale = start.endsWith(":30");

    if (isHalfHourScale) {
      gridContext += `TIME SCALE (half-hour format): Labels end in ":30" (e.g., "${start}", next label = an hour later).\n`;
      gridContext += `Each label marks the START of a 1-hour row.\n`;
      gridContext += `HOW TO READ BLOCK TIMES:\n`;
      gridContext += `- startTime = the label at the row where the block's TOP edge begins.\n`;
      gridContext += `- endTime = the label at the row where the block's BOTTOM edge ends (the NEXT label below the block).\n`;
      gridContext += `- Count the number of rows the block spans: 1 row = 1h, 2 rows = 2h, 3 rows = 3h.\n`;
      gridContext += `- Example: if a block starts at the "09:30" label and spans 3 rows, it covers 09:30, 10:30, 11:30 → endTime = 12:30.\n`;
      gridContext += `- Example: if a block starts at the "12:30" label and spans 3 rows, it covers 12:30, 13:30, 14:30 → endTime = 15:30.\n`;
      gridContext += `- IMPORTANT: carefully count how many row boundaries the block crosses. Do NOT undercount.\n`;
      gridContext += `Scale range: ${start} through ${end}, each row = ${interval} minutes.\n`;
    } else {
      gridContext += `TIME SCALE (integer-hour format): Labels are full hours (e.g., "08:00", "09:00", converted from bare integers like "08", "09").\n`;
      gridContext += `Each label marks the TOP of that hour slot. Block TOP edge = startTime, BOTTOM edge = endTime.\n`;
      gridContext += `Read startTime and endTime directly from the scale rows the block spans.\n`;
      gridContext += `Scale range: ${start} through ${end}, each row = ${interval} minutes.\n`;
    }
  } else {
    gridContext += `NO TIME SCALE visible. Estimate times from vertical block positions only.\n`;
    gridContext += `- The topmost block in the image starts at 08:00 (default assumption unless evidence suggests otherwise).\n`;
    gridContext += `- Compare vertical positions: blocks at the same height have the same startTime.\n`;
    gridContext += `- Use block height relative to the full image to estimate duration.\n`;
    gridContext += `- Common HKBU course durations: 1h, 1.5h, 2h, 3h. Use 30-minute granularity.\n`;
  }

  if (gridAnalysis.hasDayHeaders && gridAnalysis.dayHeaders && gridAnalysis.dayHeaders.length > 0) {
    const dayMap: Record<string, number> = {
      mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
      "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7,
    };
    const headers = gridAnalysis.dayHeaders;
    const firstKey = headers[0].toLowerCase().slice(0, 3);
    const firstDay = dayMap[firstKey] ?? 1;
    const mappings = headers.map((h, i) => `column ${i + 1} = "${h}" → dayOfWeek=${firstDay + i}`).join(", ");

    gridContext += `DAY HEADERS found: ${headers.join(", ")}.\n`;
    gridContext += `Column-to-day mapping: ${mappings}.\n`;
    gridContext += `Map courses to dayOfWeek using these exact columns. Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7.\n`;
  } else {
    gridContext += `NO DAY HEADERS visible. There are ${gridAnalysis.columns} column(s) of course blocks.\n`;
    gridContext += `Assign dayOfWeek by column position: leftmost column = 1 (Mon), next = 2 (Tue), etc.\n`;
    gridContext += `CRITICAL: Courses in different columns MUST have different dayOfWeek values. Do NOT put all courses on the same day.\n`;
  }

  return `Extract all courses from this timetable image.

GRID CONTEXT (from prior analysis):
${gridContext}
HKBU COURSE BLOCK RULES:
- Course codes follow pattern CODE#### (2-5 capital letters + 4 digits): e.g., GCAP3105, MATH2225, COMP3115, LANG1035, GTSU2067, ISEM3005, OEE702
- Each block typically shows: line 1 = course code + optional section in parentheses, line 2 = room/location
- Strip parentheses and their contents from names: "GCAP3105 (00001)" -> "GCAP3105", "LANG1035 (00001)" -> "LANG1035"
- Preserve locations exactly: JC3_UG05, LMC512, AAB506, RRS638, FSC901C, OEM804, AAB705, DLB302
- If a block shows multiple room codes, combine with comma: "FSC801C, FSC901D, FSC901C, FSC901D"
- One visual block = one course record. Do NOT split a single tall block into multiple records.
- If multiple distinct course codes appear in one block area, create one record per course code.

TIME RULES:
- Use 30-minute granularity: 08:00, 08:30, 09:00, 09:30, etc.
- Format: "HH:mm" (24-hour, zero-padded)
- No overlapping times for courses in the same column/day
- SELF-CHECK: After extracting all courses, compare block heights visually. If two blocks in the image appear to be the SAME height, they MUST have the SAME duration. If one is confirmed as 3h, all blocks of similar height must also be 3h. Adjust any underestimates before outputting.
- HKBU courses are commonly 3 hours long. If a block appears to span most of a 3-hour window but you estimated only 2h, re-examine — it is likely 3h.

DAY RULES:
- dayOfWeek: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7

IGNORE: student info ("Student No.", "Data as of"), semester text, color coding, app UI chrome (status bar, back button, title bar).

Output: JSON array only. No markdown. No explanation.
[{"name":"GCAP3105","location":"JC3_UG05","dayOfWeek":4,"startTime":"09:30","endTime":"12:30"}]
Return [] if not a timetable.`;
}

export async function parseScheduleImage(imageUrl: string): Promise<ParsedCourse[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const base64Image = await imageToBase64(imageUrl);

  // ─── Stage 1: Analyze grid structure ───────────────────────────────────────
  const gridContent = await callVisionModel(apiKey, base64Image, GRID_ANALYSIS_PROMPT, 1024);

  let gridAnalysis: GridAnalysis = {
    columns: 5,
    dayHeaders: null,
    timeScale: null,
    hasTimeScale: false,
    hasDayHeaders: false,
  };

  try {
    const gridObjMatch = gridContent.match(/\{[\s\S]*\}/);
    if (gridObjMatch) {
      const gridObj = JSON.parse(gridObjMatch[0]) as Record<string, unknown>;
      gridAnalysis = {
        columns: Number(gridObj.columns) || 5,
        dayHeaders: Array.isArray(gridObj.dayHeaders) && gridObj.dayHeaders.length > 0
          ? gridObj.dayHeaders.map(String)
          : null,
        timeScale: Array.isArray(gridObj.timeLabels) && gridObj.timeLabels.length >= 2
          ? {
              start: String(gridObj.timeLabels[0]),
              end: String(gridObj.timeLabels[gridObj.timeLabels.length - 1]),
              interval: Number(gridObj.timeInterval) || 60,
            }
          : null,
        hasTimeScale: Boolean(gridObj.hasTimeScale),
        hasDayHeaders: Boolean(gridObj.hasDayHeaders),
      };
    }
  } catch {
    // Grid analysis failed — proceed with defaults, stage 2 will still work
  }

  // ─── Stage 2: Extract courses with grid context ────────────────────────────
  const extractionPrompt = buildExtractionPrompt(gridAnalysis);
  const coursesContent = await callVisionModel(apiKey, base64Image, extractionPrompt, 4096);
  const parsed = extractJSON(coursesContent);

  // ─── Post-processing ──────────────────────────────────────────────────────

  function normalizeTime(raw: unknown, fallback: string): string {
    const s = String(raw || fallback).replace(/\s*(AM|PM|am|pm)\s*$/i, "").trim();
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const h = Math.min(23, Math.max(0, Number(match[1])));
    const m = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function cleanCourseName(raw: string): string {
    return raw.replace(/\s*\([^)]*\)\s*/g, "").trim();
  }

  const rawCourses = parsed.map((item) => {
    const c = item as Record<string, unknown>;
    return {
      name: cleanCourseName(String(c.name || "")),
      location: String(c.location || ""),
      dayOfWeek: Math.min(7, Math.max(1, Number(c.dayOfWeek) || 1)),
      startTime: normalizeTime(c.startTime, "08:00"),
      endTime: normalizeTime(c.endTime, "09:00"),
    };
  });

  // Only merge exact duplicates (same name + day + exact same time) — combine locations
  const mergeKey = (c: ParsedCourse) => `${c.name}|${c.dayOfWeek}|${c.startTime}|${c.endTime}`;
  const merged = new Map<string, ParsedCourse>();
  for (const course of rawCourses) {
    const key = mergeKey(course);
    const existing = merged.get(key);
    if (existing) {
      if (course.location && !existing.location.includes(course.location)) {
        existing.location = existing.location
          ? `${existing.location}, ${course.location}`
          : course.location;
      }
    } else {
      merged.set(key, { ...course });
    }
  }

  const finalCourses = Array.from(merged.values());

  // Snap times to 30-minute granularity (round to nearest :00 or :30)
  for (const course of finalCourses) {
    const startMin = timeToMinutes(course.startTime);
    const endMin = timeToMinutes(course.endTime);
    if (startMin < 0 || endMin < 0) continue;

    const snapTo30 = (min: number) => Math.round(min / 30) * 30;
    const snappedStart = snapTo30(startMin);
    const snappedEnd = snapTo30(endMin);

    // Ensure minimum 30 min duration
    const finalEnd = snappedEnd <= snappedStart ? snappedStart + 60 : snappedEnd;

    course.startTime = `${String(Math.floor(snappedStart / 60)).padStart(2, "0")}:${String(snappedStart % 60).padStart(2, "0")}`;
    course.endTime = `${String(Math.floor(finalEnd / 60)).padStart(2, "0")}:${String(finalEnd % 60).padStart(2, "0")}`;
  }

  return finalCourses;
}
