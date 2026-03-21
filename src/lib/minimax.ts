import fs from "fs";
import path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.0-flash-001";

interface ParsedCourse {
  name: string;
  location: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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

export async function parseScheduleImage(imageUrl: string): Promise<ParsedCourse[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const base64Image = await imageToBase64(imageUrl);

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
            {
              type: "image_url",
              image_url: { url: base64Image },
            },
            {
              type: "text",
              text: `你是一个课表识别助手。请分析这张大学课表图片，提取所有课程信息。

返回 JSON 数组，每个课程包含：
- name: 课程名称/代码（如 "COMP3115"）
- location: 上课地点/教室（如 "FSC801"），如果没有则为空字符串
- dayOfWeek: 星期几（1=周一，2=周二，...，7=周日）
- startTime: 开始时间（"HH:mm" 24小时格式）
- endTime: 结束时间（"HH:mm" 24小时格式）

只返回 JSON 数组，不要 markdown 代码块，不要其他文字。示例：
[{"name":"COMP3115","location":"FSC801","dayOfWeek":2,"startTime":"08:00","endTime":"09:30"}]`,
            },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(60000),
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

  // Extract JSON array from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`No JSON array found in response: ${content.slice(0, 300)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Failed to parse JSON: ${jsonMatch[0].slice(0, 300)}`);
  }

  if (!Array.isArray(parsed)) throw new Error("Response is not an array");

  const rawCourses = parsed.map((item: Record<string, unknown>) => ({
    name: String(item.name || ""),
    location: String(item.location || ""),
    dayOfWeek: Math.min(7, Math.max(1, Number(item.dayOfWeek) || 1)),
    startTime: String(item.startTime || "08:00"),
    endTime: String(item.endTime || "09:00"),
  }));

  // Merge duplicate courses (same name + dayOfWeek + time) — combine locations
  const mergeKey = (c: ParsedCourse) => `${c.name}|${c.dayOfWeek}|${c.startTime}|${c.endTime}`;
  const merged = new Map<string, ParsedCourse>();
  for (const course of rawCourses) {
    const key = mergeKey(course);
    const existing = merged.get(key);
    if (existing) {
      // Append location if different
      if (course.location && !existing.location.includes(course.location)) {
        existing.location = existing.location
          ? `${existing.location}, ${course.location}`
          : course.location;
      }
    } else {
      merged.set(key, { ...course });
    }
  }

  return Array.from(merged.values());
}
